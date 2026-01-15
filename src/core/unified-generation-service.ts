import { StoryManager } from "./story-manager";
import { ContextStrategyFactory, StrategyResult } from "./context-strategies";
import { GenerationSession } from "./generation-types";
import { GenX } from "../../lib/gen-x";
import { Subscribable } from "./subscribable";
import { APP_CONFIG } from "../config/app-config";

export interface GenerationStrategy {
  buildContext(session: GenerationSession): Promise<StrategyResult>;
  onDelta(
    session: GenerationSession,
    buffer: string,
    manager: StoryManager,
  ): Promise<void>;
  onComplete(
    session: GenerationSession,
    manager: StoryManager,
    finalText: string,
  ): Promise<void>;
}

export class UnifiedGenerationService extends Subscribable<string> {
  private genX: GenX = new GenX();

  constructor(private storyManager: StoryManager) {
    super();
  }

  public async run(
    session: GenerationSession,
    strategy: GenerationStrategy,
  ): Promise<void> {
    const notify = () => this.notify(session.fieldId);
    session.isRunning = true;
    session.cancellationSignal = await api.v1.createCancellationSignal();
    session.budgetWaitTime = undefined;
    session.budgetTimeRemaining = undefined;
    session.budgetWaitEndTime = undefined;
    session.error = undefined;
    notify();

    // Sync GenX state to session
    const unsubscribe = this.genX.subscribe((state) => {
      // Only update if this session is the one running? 
      // Since GenX is single threaded, if we are in 'run', we are likely the active one 
      // OR we are queued. GenX state reflects the *global* generation state.
      // We map relevant budget/status info to the session.
      
      if (state.status === "waiting_for_user" || state.status === "waiting_for_budget") {
          session.budgetState = state.budgetState;
          session.budgetTimeRemaining = state.budgetTimeRemaining;
          session.budgetWaitEndTime = state.budgetWaitEndTime;
          session.budgetResolver = state.budgetResolver;
          session.budgetRejecter = state.budgetRejecter;
      } else if (state.status === "generating") {
          session.budgetState = "normal";
          session.budgetTimeRemaining = undefined;
      }
      notify();
    });

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

      const model = (await api.v1.config.get("model")) || APP_CONFIG.MODELS.DEFAULT;

      const applyFilters = (t: string) => {
        let out = t;
        if (result.filters) {
          for (const filter of result.filters) {
            out = filter(out);
          }
        }
        return out;
      };

      await this.genX.generate(
        messages,
        {
          max_tokens: 1024,
          model,
          ...params,
          minTokens: params.minTokens || 50
        },
        async (choices) => {
          const text = choices[0]?.text;
          if (text) {
            const filtered = applyFilters(text);
            buffer += filtered;
            await strategy.onDelta(session, buffer, this.storyManager);
            notify();
          }
        },
        "background",
        session.cancellationSignal,
      );

      if (session.cancellationSignal.cancelled) return;

      await strategy.onComplete(session, this.storyManager, buffer);
      notify();
    } catch (e: any) {
      if (!e.message?.includes("cancelled") && e !== "Cancelled") {
        api.v1.log("Generation Error Stack:", e.stack || e);
        session.error = e.message || String(e);
        api.v1.ui.toast(`Generation failed: ${session.error}`, {
          type: "error",
        });
      }
    } finally {
      unsubscribe();
      session.isRunning = false;
      session.cancellationSignal = undefined;
      session.budgetState = undefined;
      session.budgetTimeRemaining = undefined;
      session.budgetWaitEndTime = undefined;
      session.budgetResolver = undefined;
      session.budgetRejecter = undefined;
      notify();
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
  ): Promise<void> {
    await manager.saveFieldDraft(session.fieldId, buffer);
  }

  async onComplete(
    session: GenerationSession,
    manager: StoryManager,
    finalText: string,
  ): Promise<void> {
    await manager.setFieldContent(
      session.fieldId,
      finalText,
      "immediate",
    );
    if (session.fieldId.startsWith("lorebook:")) {
      const entryId = session.fieldId.split(":")[1];
      await manager.generateLorebookKeys(entryId, finalText);
    }
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
  ): Promise<void> {
    session.outputBuffer = buffer;
  }

  async onComplete(
    session: GenerationSession,
    manager: StoryManager,
    finalText: string,
  ): Promise<void> {
    if (!session.dulfsFieldId) return;

    // Parse newline-separated list
    // Clean up markdown list syntax if present (e.g. "1. Name", "- Name")
    const cleaned = finalText.replace(/^[\d-]+\.\s*|^\s*-\s*/gm, "");
    const names = cleaned
      .split(/\r?\n/) // Split by newline
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (names.length > 0) {
      await manager.mergeDulfsNames(session.dulfsFieldId, names);
      api.v1.ui.toast(`Added ${names.length} items to list`);
    } else {
      api.v1.ui.toast("No new items generated", { type: "warning" });
    }
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
  ): Promise<void> {
    if (session.dulfsFieldId && session.dulfsItemId) {
      await manager.updateDulfsItem(
        session.dulfsFieldId,
        session.dulfsItemId,
        { content: buffer },
        "none", // Stream to memory only
      );
    }
  }

  async onComplete(
    session: GenerationSession,
    manager: StoryManager,
    finalText: string,
  ): Promise<void> {
    if (session.dulfsFieldId && session.dulfsItemId) {
      await manager.updateDulfsItem(
        session.dulfsFieldId,
        session.dulfsItemId,
        { content: finalText },
        "immediate", // Save and sync
      );
      // Auto-parse to update description and sync fully
      await manager.parseAndUpdateDulfsItem(
        session.dulfsFieldId,
        session.dulfsItemId,
      );
    }
  }
}

export class BrainstormStrategy implements GenerationStrategy {
  constructor(private contextFactory: ContextStrategyFactory) {}

  async buildContext(session: GenerationSession): Promise<StrategyResult> {
    return this.contextFactory.buildBrainstormContext(!!session.isInitial);
  }

  async onDelta(
    session: GenerationSession,
    buffer: string,
    _manager: StoryManager,
  ): Promise<void> {
    session.outputBuffer = buffer;
  }

  async onComplete(
    session: GenerationSession,
    manager: StoryManager,
    finalText: string,
  ): Promise<void> {
    session.outputBuffer = undefined; // Clear buffer on completion
    manager.addBrainstormMessage("assistant", finalText);
    await manager.saveStoryData();
  }
}

export class DulfsSummaryStrategy implements GenerationStrategy {
  constructor(private contextFactory: ContextStrategyFactory) {}

  async buildContext(session: GenerationSession): Promise<StrategyResult> {
    if (!session.dulfsFieldId) throw new Error("Missing dulfsFieldId");
    return this.contextFactory.buildDulfsSummaryContext(session.dulfsFieldId);
  }

  async onDelta(
    _session: GenerationSession,
    _buffer: string,
    _manager: StoryManager,
  ): Promise<void> {
    // Could expose stream here if UI supports it
  }

  async onComplete(
    session: GenerationSession,
    manager: StoryManager,
    finalText: string,
  ): Promise<void> {
    if (!session.dulfsFieldId) return;
    await manager.setDulfsSummary(session.dulfsFieldId, finalText, "immediate");
  }
}
