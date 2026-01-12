import { StoryManager, DULFSField } from "./story-manager";
import { ContextStrategyFactory, StrategyResult } from "./context-strategies";
import { ContentParsingService } from "./content-parsing-service";
import { GenerationSession } from "./generation-types";
import { hyperGenerate } from "../../lib/hyper-generator";

export interface GenerationStrategy {
  buildContext(session: GenerationSession): Promise<StrategyResult>;
  onDelta(
    session: GenerationSession,
    buffer: string,
    manager: StoryManager,
    updateFn: () => void,
  ): Promise<void>;
  onComplete(
    session: GenerationSession,
    manager: StoryManager,
    finalText: string,
    updateFn: () => void,
  ): Promise<void>;
}

export class UnifiedGenerationService {
  constructor(
    private storyManager: StoryManager,
  ) {}

  public async run(
    session: GenerationSession,
    strategy: GenerationStrategy,
    updateFn: () => void,
  ): Promise<void> {
    session.isRunning = true;
    session.cancellationSignal = await api.v1.createCancellationSignal();
    session.budgetWaitTime = undefined;
    session.budgetTimeRemaining = undefined;
    session.budgetWaitEndTime = undefined;
    session.error = undefined;
    updateFn();

    try {
      const result = await strategy.buildContext(session);
      const { messages, params } = result;

      // Handle assistant pre-fill
      let buffer = "";
      const lastMsg = messages[messages.length - 1];
      const prefixBehavior = result.prefixBehavior || "keep";

      if (lastMsg && lastMsg.role === "assistant" && lastMsg.content) {
        if (prefixBehavior === "keep") {
          buffer = lastMsg.content;
        }
      }

      const model = (await api.v1.config.get("model")) || "glm-4-6";

      const applyFilters = (t: string) => {
        let out = t;
        if (result.filters) {
          for (const filter of result.filters) {
            out = filter(out);
          }
        }
        return out;
      };

      await hyperGenerate(
        messages,
        {
          maxTokens: 2048,
          model,
          ...params,
          minTokens: params.minTokens || 50,
          onBudgetWait: (_1, _2, time) => {
            return new Promise<void>((resolve, reject) => {
              session.budgetResolver = () => {
                session.budgetState = "waiting_for_timer";
                const targetEnd = Date.now() + time;
                session.budgetWaitEndTime = targetEnd;

                const tick = () => {
                  if (!session.isRunning) return;
                  const now = Date.now();
                  if (now >= targetEnd) {
                    resolve();
                    return;
                  }
                  session.budgetTimeRemaining = Math.max(0, targetEnd - now);
                  updateFn();
                  api.v1.timers.setTimeout(tick, 1000);
                };
                tick();
                updateFn();
              };
              session.budgetRejecter = (reason) => {
                reject(reason || "Cancelled");
              };
              session.budgetState = "waiting_for_user";
              session.budgetWaitTime = time;
              session.budgetWaitEndTime = Date.now() + time;
              updateFn();
            });
          },
          onBudgetResume: () => {
            session.budgetState = "normal";
            session.budgetTimeRemaining = undefined;
            session.budgetResolver = undefined;
            session.budgetRejecter = undefined;
            updateFn();
          },
        },
        async (text) => {
          if (text) {
            const filtered = applyFilters(text);
            buffer += filtered;
            await strategy.onDelta(
              session,
              buffer,
              this.storyManager,
              updateFn,
            );
          }
        },
        "background",
        session.cancellationSignal,
      );

      if (session.cancellationSignal.cancelled) return;

      await strategy.onComplete(session, this.storyManager, buffer, updateFn);
    } catch (e: any) {
      if (!e.message?.includes("cancelled") && e !== "Cancelled") {
        session.error = e.message || String(e);
        api.v1.ui.toast(`Generation failed: ${session.error}`, {
          type: "error",
        });
      }
    } finally {
      session.isRunning = false;
      session.cancellationSignal = undefined;
      session.budgetState = undefined;
      session.budgetTimeRemaining = undefined;
      session.budgetWaitEndTime = undefined;
      session.budgetResolver = undefined;
      session.budgetRejecter = undefined;
      updateFn();
    }
  }
}

// --- Concrete Strategies ---

export class FieldGenerationStrategy implements GenerationStrategy {
  constructor(private contextFactory: ContextStrategyFactory) {}

  async buildContext(session: GenerationSession): Promise<StrategyResult> {
    return this.contextFactory.build(session);
  }

  async onDelta(
    session: GenerationSession,
    buffer: string,
    manager: StoryManager,
    updateFn: () => void,
  ): Promise<void> {
    await manager.saveFieldDraft(session.fieldId, buffer);
    updateFn();
  }

  async onComplete(
    session: GenerationSession,
    manager: StoryManager,
    finalText: string,
    updateFn: () => void,
  ): Promise<void> {
    await manager.setFieldContent(
      session.fieldId,
      finalText,
      "immediate",
      true,
    );
    if (session.fieldId.startsWith("lorebook:")) {
      const entryId = session.fieldId.split(":")[1];
      await manager.generateLorebookKeys(entryId, finalText);
    }
    updateFn();
  }
}

export class DulfsItemStrategy implements GenerationStrategy {
  constructor(
    private contextFactory: ContextStrategyFactory,
    private parsingService: ContentParsingService,
  ) {}

  async buildContext(session: GenerationSession): Promise<StrategyResult> {
    if (!session.dulfsFieldId) throw new Error("Missing dulfsFieldId");
    return this.contextFactory.buildDulfsItemContext(session.dulfsFieldId);
  }

  async onDelta(
    session: GenerationSession,
    buffer: string,
    manager: StoryManager,
    updateFn: () => void,
  ): Promise<void> {
    session.outputBuffer = buffer;
    updateFn();
  }

  async onComplete(
    session: GenerationSession,
    manager: StoryManager,
    finalText: string,
    updateFn: () => void,
  ): Promise<void> {
    if (!session.dulfsFieldId) return;

    const parsed = this.parsingService.parseDulfsItem(finalText, session.dulfsFieldId);
    if (parsed) {
      const newItem: DULFSField = {
        id: api.v1.uuid(),
        category: session.dulfsFieldId as any,
        content: parsed.content,
        name: parsed.name,
        description: parsed.description,
        attributes: {},
        linkedLorebooks: [],
      };
      manager.addDulfsItem(session.dulfsFieldId, newItem);
      api.v1.ui.toast(`Generated ${parsed.name}`);
    } else {
      api.v1.ui.toast("Failed to parse generated item", { type: "warning" });
      api.v1.log("Failed to parse DULFS item:", finalText);
    }
    updateFn();
  }
}

export class BrainstormStrategy implements GenerationStrategy {
  constructor(
    private contextFactory: ContextStrategyFactory,
    private onDeltaCallback?: (text: string) => void,
  ) {}

  async buildContext(session: GenerationSession): Promise<StrategyResult> {
    return this.contextFactory.buildBrainstormContext(!!session.isInitial);
  }

  async onDelta(
    session: GenerationSession,
    buffer: string,
    manager: StoryManager,
    updateFn: () => void,
  ): Promise<void> {
    if (this.onDeltaCallback) {
      this.onDeltaCallback(buffer);
    }
    updateFn();
  }

  async onComplete(
    session: GenerationSession,
    manager: StoryManager,
    finalText: string,
    updateFn: () => void,
  ): Promise<void> {
    manager.addBrainstormMessage("assistant", finalText);
    await manager.saveStoryData(true);
    updateFn();
  }
}