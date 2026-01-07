import { StoryManager, DULFSField } from "./story-manager";
import { FieldSession } from "./agent-cycle";
import { hyperGenerate } from "../../lib/hyper-generator";
import { ContextStrategyFactory } from "./context-strategies";
import { ReviewPatcher } from "./review-patcher";
import { FieldID } from "../config/field-definitions";
import {
  StageHandler,
  GenerateStageHandler,
  ReviewStageHandler,
  RefineStageHandler,
} from "./stage-handlers";

export class AgentWorkflowService {
  private contextFactory: ContextStrategyFactory;
  private reviewPatcher: ReviewPatcher;
  private handlers: Record<string, StageHandler>;

  // Track list generation state: fieldId -> { isRunning, signal }
  private listGenerationState: Map<
    string,
    { isRunning: boolean; signal?: any }
  > = new Map();

  constructor(private storyManager: StoryManager) {
    this.contextFactory = new ContextStrategyFactory(storyManager);
    this.reviewPatcher = new ReviewPatcher(storyManager);
    this.handlers = {
      generate: new GenerateStageHandler(storyManager),
      review: new ReviewStageHandler(this.reviewPatcher),
      refine: new RefineStageHandler(
        storyManager,
        this.contextFactory,
        this.reviewPatcher,
      ),
    };
  }

  public getListGenerationState(fieldId: string) {
    return this.listGenerationState.get(fieldId) || { isRunning: false };
  }

  public cancelListGeneration(fieldId: string) {
    const state = this.listGenerationState.get(fieldId);
    if (state && state.signal) {
      state.signal.cancel();
    }
  }

  private parseListLine(
    line: string,
    fieldId: string,
  ): { name: string; description: string; content: string } | null {
    let clean = line.trim();

    // Still strip list markers because models are stubborn, and they shouldn't be part of the final data
    clean = clean.replace(/^[-*+]\s+/, "");
    clean = clean.replace(/^\d+[\.)]\s+/, "");

    if (fieldId === FieldID.DramatisPersonae) {
      // Regex for: Name (gender, age, occupation): motivation, tell
      // Hammer: must have the parens with commas and a colon
      const dpRegex = /^([^:(]+)\s*\(([^,]+),\s*([^,]+),\s*([^)]+)\):\s*(.+)$/;
      const match = clean.match(dpRegex);
      if (match) {
        return {
          name: match[1].trim(),
          description: match[5].trim(),
          content: clean,
        };
      }
    } else {
      // Hammer: Name: Description
      const genericRegex = /^([^:]+):\s*(.+)$/;
      const match = clean.match(genericRegex);
      if (match) {
        return {
          name: match[1].trim(),
          description: match[2].trim(),
          content: clean,
        };
      }
    }

    return null;
  }

  public async runListGeneration(
    fieldId: string,
    updateFn: () => void,
  ): Promise<void> {
    const cancellationSignal = await api.v1.createCancellationSignal();
    this.listGenerationState.set(fieldId, {
      isRunning: true,
      signal: cancellationSignal,
    });
    updateFn();

    try {
      const { messages, params } =
        await this.contextFactory.buildDulfsContext(fieldId);

      const model = (await api.v1.config.get("model")) || "glm-4-6";
      let buffer = "";

      await hyperGenerate(
        messages,
        {
          maxTokens: 2048,
          minTokens: 50,
          model,
          ...params,
        },
        (text) => {
          buffer += text;
          const lines = buffer.split("\n");
          // Keep the last segment as it might be incomplete
          buffer = lines.pop() || "";

          for (const line of lines) {
            const parsed = this.parseListLine(line, fieldId);
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
        cancellationSignal,
      );

      if (cancellationSignal.cancelled) return;

      // Process any remaining buffer
      if (buffer.trim().length > 0) {
        const parsed = this.parseListLine(buffer, fieldId);
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
        api.v1.ui.toast(`List generation failed: ${e.message}`, {
          type: "error",
        });
      }
    } finally {
      this.listGenerationState.set(fieldId, {
        isRunning: false,
        signal: undefined,
      });
      updateFn();
    }
  }

  public async runSimpleGeneration(
    fieldId: string,
    updateFn: () => void,
  ): Promise<void> {
    const cancellationSignal = await api.v1.createCancellationSignal();
    this.listGenerationState.set(fieldId, {
      isRunning: true,
      signal: cancellationSignal,
    });
    updateFn();

    try {
      const fakeSession = {
        id: "temp",
        fieldId: fieldId,
        selectedStage: "generate",
        cycles: {},
        history: [],
        isAuto: false,
      } as unknown as FieldSession;

      const { messages, params } = await this.contextFactory.build(fakeSession);

      // Find assistant pre-fill if it exists
      let buffer = "";
      const lastMsg = messages[messages.length - 1];
      if (lastMsg && lastMsg.role === "assistant" && lastMsg.content) {
        buffer = lastMsg.content;
      }

      await this.storyManager.saveFieldDraft(fieldId, buffer);
      const model = (await api.v1.config.get("model")) || "glm-4-6";

      await hyperGenerate(
        messages,
        {
          maxTokens: 256,
          model,
          ...params,
          minTokens: params.minTokens || 50,
        },
        (text) => {
          // Only update if we actually got text (prevents empty chunk spam)
          if (text) {
            buffer += text;
            this.storyManager.saveFieldDraft(fieldId, buffer);
            updateFn();
          }
        },
        "background",
        cancellationSignal,
      );

      if (cancellationSignal.cancelled) return;

      await this.storyManager.setFieldContent(fieldId, buffer, true, true);
    } catch (e: any) {
      if (!e.message.includes("cancelled")) {
        api.v1.ui.toast(`Generation failed: ${e.message}`, { type: "error" });
      }
    } finally {
      this.listGenerationState.set(fieldId, {
        isRunning: false,
        signal: undefined,
      });
      updateFn();
    }
  }

  public async runAutoGeneration(
    session: FieldSession,
    updateFn: () => void,
  ): Promise<void> {
    const stages: ("generate" | "review" | "refine")[] = [
      "generate",
      "review",
      "refine",
    ];
    const startIndex = stages.indexOf(session.selectedStage);

    // Iterate from current stage to the end
    for (let i = startIndex; i < stages.length; i++) {
      // If auto-advance was disabled (e.g. by manual cancel), stop
      if (!session.isAuto) {
        break;
      }

      session.selectedStage = stages[i];
      updateFn(); // Switch tab

      const success = await this.runStageGeneration(session, updateFn);
      if (!success || !session.isAuto) {
        session.isAuto = false;
        updateFn();
        break;
      }

      // Small pause between stages for visual clarity
      if (i < stages.length - 1) {
        await api.v1.timers.sleep(500);
      }
    }

    // Automatically disable auto after completion
    session.isAuto = false;
    updateFn();
  }

  public async runStageGeneration(
    session: FieldSession,
    updateFn: () => void,
  ): Promise<boolean> {
    const stage = session.selectedStage;
    const handler = this.handlers[stage];

    session.cycles[stage].status = "running";
    session.cycles[stage].content = "";

    // 1. Stage-specific Start
    await handler.onStart(session);

    // @ts-ignore
    session.cancellationSignal = await api.v1.createCancellationSignal();

    // 2. Check for Override
    if (handler.overrideGeneration) {
      const success = await handler.overrideGeneration(session, updateFn);
      if (success) {
        const finalResult = session.cycles[stage].content;
        const completionResult = await handler.onComplete(session, finalResult);
        session.cycles[stage].content = completionResult;
        session.cycles[stage].status = "completed";
      } else {
        session.cycles[stage].status = "idle";
      }
      return success;
    }

    updateFn();

    try {
      const { messages, params } = await this.contextFactory.build(session);

      // Detect assistant pre-fill
      let prefill = "";
      const lastMsg = messages[messages.length - 1];
      if (lastMsg && lastMsg.role === "assistant" && lastMsg.content) {
        prefill = lastMsg.content;
      }

      // Only initialize content with pre-fill for 'generate' stage.
      // For 'review' and 'refine', the pre-fill is just transition talk and shouldn't be in the field content.
      if (stage === "generate") {
        session.cycles[stage].content = prefill;
      } else {
        session.cycles[stage].content = "";
      }

      // Capture original content for handlers that need it (Refine)
      const originalDraft = this.storyManager.getFieldContent(session.fieldId);

      // 3. Generate
      if (!session.cancellationSignal)
        throw new Error("Failed to create cancellation signal");
      const model = (await api.v1.config.get("model")) || "glm-4-6";

      await hyperGenerate(
        messages,
        {
          maxTokens: 2048,
          minTokens: 50,
          model,
          ...params,
          onBudgetWait: (_1, _2, time) => {
            session.budgetState = "waiting_for_user";
            session.budgetWaitTime = time;
            updateFn();
            return new Promise<void>((resolve) => {
              session.budgetResolver = resolve;
            });
          },
          onBudgetResume: () => {
            session.budgetState = "normal";
            updateFn();
          },
        },
        (text) => {
          session.cycles[stage].content += text; // Append delta

          // Delegate stream handling
          handler.onStream(
            session,
            text,
            session.cycles[stage].content,
            originalDraft,
          );

          updateFn();
        },
        "background",
        session.cancellationSignal,
      );

      if (session.cancellationSignal.cancelled) {
        session.cycles[stage].status = "idle";
        return false;
      }

      // 4. Stage-specific Completion
      // Use the accumulated content from streaming, as it correctly includes the pre-fill for 'generate'
      // and excludes it for others (as initialized above).
      const totalAccumulated = session.cycles[stage].content;
      const completionResult = await handler.onComplete(
        session,
        totalAccumulated,
      );

      session.cycles[stage].content = completionResult;
      session.cycles[stage].status = "completed";

      return true;
    } catch (e: any) {
      if (
        e.message &&
        (e.message.includes("cancelled") || e.message.includes("Aborted"))
      ) {
        session.cycles[stage].status = "idle";
        api.v1.log("Generation cancelled");
        return false;
      } else {
        session.cycles[stage].status = "idle";
        api.v1.ui.toast(`Generation failed: ${e.message}`, { type: "error" });
        api.v1.log(`Generation failed: ${e}`);
        return false;
      }
    } finally {
      session.cancellationSignal = undefined;
      // Ensure we don't leave it in running state if something weird happened
      if (session.cycles[stage].status === "running") {
        session.cycles[stage].status = "idle";
      }
      updateFn();
    }
  }
}
