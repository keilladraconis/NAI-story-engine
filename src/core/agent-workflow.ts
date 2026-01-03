import { StoryManager } from "./story-manager";
import { FieldSession } from "./agent-cycle";
import { hyperGenerate } from "../hyper-generator";
import { ContextStrategyFactory } from "./context-strategies";

export class AgentWorkflowService {
  private contextFactory: ContextStrategyFactory;

  constructor(private storyManager: StoryManager) {
    this.contextFactory = new ContextStrategyFactory(storyManager);
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
      // If cancelled during auto-run, stop
      if (session.cancellationSignal && session.cancellationSignal.cancelled) {
        break;
      }

      session.selectedStage = stages[i];
      updateFn(); // Switch tab

      const success = await this.runStageGeneration(session, updateFn);
      if (!success) {
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
    session.cycles[stage].status = "running";
    session.cycles[stage].content = ""; // Clear previous content
    session.currentContent = "";

    // @ts-ignore
    session.cancellationSignal = await api.v1.createCancellationSignal();
    updateFn();

    try {
      const contextMessages = await this.contextFactory.build(session);

      // 3. Generate
      if (!session.cancellationSignal)
        throw new Error("Failed to create cancellation signal");

      const result = await hyperGenerate(
        contextMessages,
        {
          maxTokens: 2048,
          minTokens: 50,
          onBudgetWait: (available, needed, time) => {
            session.budgetState = "waiting_for_user";
            session.budgetWaitTime = time;
            updateFn();
            return new Promise<void>((resolve) => {
              session.budgetResolver = resolve;
            });
          },
          onBudgetResume: (available) => {
            session.budgetState = "normal";
            updateFn();
          },
        },
        (text) => {
          session.cycles[stage].content += text; // Append delta
          session.currentContent = session.cycles[stage].content;
          updateFn();
        },
        "background",
        session.cancellationSignal,
      );

      session.cycles[stage].content = result;
      session.cycles[stage].status = "completed";
      session.currentContent = result;
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
