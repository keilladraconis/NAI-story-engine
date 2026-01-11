import { StoryManager } from "./story-manager";
import { hyperGenerate } from "../../lib/hyper-generator";
import { ContextStrategyFactory } from "./context-strategies";
import { FieldSession } from "./generation-types";

export class FieldGenerationService {
  constructor(
    private storyManager: StoryManager,
    private contextFactory: ContextStrategyFactory
  ) {}

  public async run(
    session: FieldSession,
    updateFn: () => void
  ): Promise<void> {
    session.isRunning = true;
    session.cancellationSignal = await api.v1.createCancellationSignal();
    session.budgetWaitTime = undefined;
    session.budgetTimeRemaining = undefined;
    session.budgetWaitEndTime = undefined;
    updateFn();

    try {
      const result = await this.contextFactory.build(session);
      const { messages, params } = result;

      // Find assistant pre-fill if it exists
      let buffer = "";
      const lastMsg = messages[messages.length - 1];
      const prefixBehavior = result.prefixBehavior || "keep";

      if (lastMsg && lastMsg.role === "assistant" && lastMsg.content) {
        if (prefixBehavior === "keep") {
          buffer = lastMsg.content;
        }
      }

      await this.storyManager.saveFieldDraft(session.fieldId, buffer);
      // Hardcoded fallback model as per original code, but could be config constant
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
            return new Promise<void>((resolve) => {
              session.budgetResolver = () => {
                session.budgetState = "waiting_for_timer";
                if (session.budgetWaitEndTime) {
                  this.startBudgetTimer(session, updateFn);
                }
                updateFn();
                resolve();
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
            updateFn();
          },
        },
        (text) => {
          if (text) {
            buffer += applyFilters(text);
            this.storyManager.saveFieldDraft(session.fieldId, buffer);
            updateFn();
          }
        },
        "background",
        session.cancellationSignal
      );

      if (session.cancellationSignal.cancelled) return;

      await this.storyManager.setFieldContent(
        session.fieldId,
        buffer,
        "immediate",
        true
      );

      // Automatically generate keys for Lorebook entries
      if (session.fieldId.startsWith("lorebook:")) {
        const entryId = session.fieldId.split(":")[1];
        await this.storyManager.generateLorebookKeys(entryId, buffer);
      }
    } catch (e: any) {
      if (!e.message.includes("cancelled")) {
        session.error = e.message;
        api.v1.ui.toast(`Generation failed: ${e.message}`, { type: "error" });
      }
    } finally {
      session.isRunning = false;
      session.cancellationSignal = undefined;
      updateFn();
    }
  }

  private startBudgetTimer(session: FieldSession, updateFn: () => void) {
    const checkTimer = () => {
      if (
        !session.isRunning ||
        session.budgetState !== "waiting_for_timer" ||
        !session.budgetWaitEndTime
      ) {
        return;
      }

      const now = Date.now();
      const remaining = Math.max(0, session.budgetWaitEndTime - now);
      session.budgetTimeRemaining = remaining;
      updateFn();

      if (remaining > 0) {
        api.v1.timers.setTimeout(checkTimer, 1000);
      }
    };
    checkTimer();
  }
}
