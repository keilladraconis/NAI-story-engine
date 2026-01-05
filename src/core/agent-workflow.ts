import { StoryManager } from "./story-manager";
import { FieldSession } from "./agent-cycle";
import { hyperGenerate } from "../hyper-generator";
import { ContextStrategyFactory } from "./context-strategies";
import { ReviewPatcher } from "./review-patcher";

export class AgentWorkflowService {
  private contextFactory: ContextStrategyFactory;
  private reviewPatcher: ReviewPatcher;

  constructor(private storyManager: StoryManager) {
    this.contextFactory = new ContextStrategyFactory(storyManager);
    this.reviewPatcher = new ReviewPatcher(storyManager);
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

    // Review streaming state
    let reviewBuffer = "";

    // Strip existing tags if starting a review
    if (stage === "review") {
      this.reviewPatcher.stripTags(session.fieldId);
      updateFn();
    }

    // @ts-ignore
    session.cancellationSignal = await api.v1.createCancellationSignal();
    updateFn();

    try {
      const { messages, params } = await this.contextFactory.build(session);

      // Capture original content for Refine "overwrite" effect
      const originalDraft = this.storyManager.getFieldContent(session.fieldId);

      // Only clear currentContent if we are going to write to it (replace)
      // Done AFTER building context so we don't lose the input!
      if (stage === "generate") {
        this.storyManager.saveFieldDraft(session.fieldId, "");
        updateFn(); // Reflect clear in UI
      }

      // 3. Generate
      if (!session.cancellationSignal)
        throw new Error("Failed to create cancellation signal");

      let result = await hyperGenerate(
        messages,
        {
          maxTokens: 2048,
          minTokens: 50,
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

          if (stage === "review") {
            reviewBuffer += text;
            const lines = reviewBuffer.split("\n");
            // Process complete lines, keep the remainder
            while (lines.length > 1) {
              const line = lines.shift()!;
              this.reviewPatcher.processReviewLine(session.fieldId, line);
            }
            reviewBuffer = lines[0];
          } else if (stage === "refine") {
            // Overwrite visualization: New Content + Cursor + Remaining Old Content
            const newLen = session.cycles[stage].content.length;
            const tail = originalDraft.slice(newLen);
            this.storyManager.saveFieldDraft(session.fieldId, session.cycles[stage].content + "✍️" + tail);
          } else {
            this.storyManager.saveFieldDraft(session.fieldId, session.cycles[stage].content);
          }
          updateFn();
        },
        "background",
        session.cancellationSignal,
      );

      // Process remaining buffer for review
      if (stage === "review" && reviewBuffer.trim()) {
        this.reviewPatcher.processReviewLine(session.fieldId, reviewBuffer);
      }

      if (stage === "review") {
        result = this.cleanReviewOutput(result);
        api.v1.log(`[Review Stage Completed]:\n${result}`);
      }

      session.cycles[stage].content = result;
      session.cycles[stage].status = "completed";

      if (stage !== "review") {
        await this.storyManager.saveFieldDraft(session.fieldId, result);
      }

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

  private cleanReviewOutput(content: string): string {
    const lines = content.split("\n");
    const validLines = lines.filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return false;
      // Validates format: [TAG] || "locator"
      // Allows optional spaces around || and optional markdown bolding **
      return /^(\*\*)?\[[A-Z_]+\](\*\*)?\s*\|\|\s*".*"$/.test(trimmed);
    });
    return validLines.join("\n");
  }
}
