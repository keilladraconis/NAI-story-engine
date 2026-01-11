import { StoryManager, DULFSField } from "./story-manager";
import { hyperGenerate } from "../../lib/hyper-generator";
import { ContextStrategyFactory } from "./context-strategies";
import { ContentParsingService } from "./content-parsing-service";
import { ListSession } from "./generation-types";

export class ListGenerationService {
  constructor(
    private storyManager: StoryManager,
    private contextFactory: ContextStrategyFactory,
    private parsingService: ContentParsingService
  ) {}

  public async run(
    fieldId: string,
    session: ListSession,
    updateFn: () => void
  ): Promise<void> {
    session.isRunning = true;
    session.cancellationSignal = await api.v1.createCancellationSignal();
    session.budgetState = "normal";
    session.error = undefined;
    session.budgetWaitTime = undefined;
    session.budgetTimeRemaining = undefined;
    session.budgetWaitEndTime = undefined;
    updateFn();

    try {
      const result = await this.contextFactory.buildDulfsContext(fieldId);
      const { messages, params } = result;

      const model = (await api.v1.config.get("model")) || "glm-4-6";
      let buffer = "";

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
          minTokens: 50,
          model,
          ...params,
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
          buffer += text;
          const lines = buffer.split("\n");
          // Keep the last segment as it might be incomplete
          buffer = lines.pop() || "";

          for (const line of lines) {
            const filteredLine = applyFilters(line);
            const parsed = this.parsingService.parseListLine(
              filteredLine,
              fieldId
            );
            if (parsed) {
              const newItem: DULFSField = {
                id: api.v1.uuid(),
                category: fieldId as any,
                content: parsed.content,
                name: parsed.name,
                description: parsed.description,
                attributes: {},
                linkedLorebooks: [],
              };
              this.storyManager.addDulfsItem(fieldId, newItem);
              updateFn();
            }
          }
        },
        "background",
        session.cancellationSignal
      );

      if (session.cancellationSignal.cancelled) return;

      // Process any remaining buffer
      if (buffer.trim().length > 0) {
        const filteredBuffer = applyFilters(buffer);
        const parsed = this.parsingService.parseListLine(
          filteredBuffer,
          fieldId
        );
        if (parsed) {
          const newItem: DULFSField = {
            id: api.v1.uuid(),
            category: fieldId as any,
            content: parsed.content,
            name: parsed.name,
            description: parsed.description,
            attributes: {},
            linkedLorebooks: [],
          };
          this.storyManager.addDulfsItem(fieldId, newItem);
          updateFn();
        }
      }
    } catch (e: any) {
      if (!e.message.includes("cancelled")) {
        session.error = e.message;
        api.v1.ui.toast(`List generation failed: ${e.message}`, {
          type: "error",
        });
      }
    } finally {
      session.isRunning = false;
      session.cancellationSignal = undefined;
      updateFn();
    }
  }

  private startBudgetTimer(session: ListSession, updateFn: () => void) {
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
