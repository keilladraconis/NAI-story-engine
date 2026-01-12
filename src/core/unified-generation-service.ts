import { StoryManager } from "./story-manager";
import { ContextStrategyFactory, StrategyResult } from "./context-strategies";
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

export class DulfsListStrategy implements GenerationStrategy {
  constructor(private contextFactory: ContextStrategyFactory) {}

  async buildContext(session: GenerationSession): Promise<StrategyResult> {
    if (!session.dulfsFieldId) throw new Error("Missing dulfsFieldId");
    return this.contextFactory.buildDulfsListContext(session.dulfsFieldId);
  }

  async onDelta(
    session: GenerationSession,
    buffer: string,
    _manager: StoryManager,
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

    // Parse comma-separated list
    // Clean up markdown list syntax if present (e.g. "1. Name")
    const cleaned = finalText.replace(/^\d+\.\s*/gm, "");
    const names = cleaned
      .split(/,|\\n/) // Split by comma or newline
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (names.length > 0) {
      await manager.mergeDulfsNames(session.dulfsFieldId, names);
      api.v1.ui.toast(`Added ${names.length} items to list`);
    } else {
      api.v1.ui.toast("No new items generated", { type: "warning" });
    }
    updateFn();
  }
}

export class DulfsContentStrategy implements GenerationStrategy {
  constructor(private contextFactory: ContextStrategyFactory) {}

  async buildContext(session: GenerationSession): Promise<StrategyResult> {
    if (!session.dulfsFieldId || !session.dulfsItemId) {
      throw new Error("Missing dulfsFieldId or dulfsItemId");
    }
    return this.contextFactory.buildDulfsContentContext(
      session.dulfsFieldId,
      session.dulfsItemId,
    );
  }

  async onDelta(
    session: GenerationSession,
    buffer: string,
    manager: StoryManager,
    updateFn: () => void,
  ): Promise<void> {
    if (session.dulfsFieldId && session.dulfsItemId) {
      await manager.updateDulfsItem(
        session.dulfsFieldId,
        session.dulfsItemId,
        { content: buffer },
        "none", // Stream to memory only
        false, // No sync yet
      );
    }
    updateFn();
  }

  async onComplete(
    session: GenerationSession,
    manager: StoryManager,
    finalText: string,
    updateFn: () => void,
  ): Promise<void> {
    if (session.dulfsFieldId && session.dulfsItemId) {
      await manager.updateDulfsItem(
        session.dulfsFieldId,
        session.dulfsItemId,
        { content: finalText },
        "immediate", // Save and sync
        true,
      );
      // Auto-parse to update description and sync fully
      await manager.parseAndUpdateDulfsItem(
        session.dulfsFieldId,
        session.dulfsItemId,
      );
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
    _session: GenerationSession,
    buffer: string,
    _manager: StoryManager,
    updateFn: () => void,
  ): Promise<void> {
    if (this.onDeltaCallback) {
      this.onDeltaCallback(buffer);
    }
    updateFn();
  }

  async onComplete(
    _session: GenerationSession,
    manager: StoryManager,
    finalText: string,
    updateFn: () => void,
  ): Promise<void> {
    manager.addBrainstormMessage("assistant", finalText);
    await manager.saveStoryData(true);
    updateFn();
  }
}