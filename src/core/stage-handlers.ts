import { StoryManager } from "./story-manager";
import { ReviewPatcher } from "./review-patcher";
import { FieldSession } from "./agent-cycle";
import { ContextStrategyFactory } from "./context-strategies";
import { hyperGenerate } from "../../lib/hyper-generator";

export interface StageHandler {
  onStart(session: FieldSession): Promise<void>;
  onStream(
    session: FieldSession,
    delta: string,
    accumulated: string,
    originalDraft: string,
  ): void;
  onComplete(session: FieldSession, finalResult: string): Promise<string>;
  /**
   * Optional: Take full control of the generation loop for this stage.
   * If provided, the AgentWorkflowService will call this instead of hyperGenerate.
   */
  overrideGeneration?(
    session: FieldSession,
    updateFn: () => void,
  ): Promise<boolean>;
}

export class GenerateStageHandler implements StageHandler {
  constructor(private storyManager: StoryManager) {}

  async onStart(session: FieldSession): Promise<void> {
    // Clear the field for fresh generation
    await this.storyManager.saveFieldDraft(session.fieldId, "");
  }

  onStream(
    session: FieldSession,
    _delta: string,
    accumulated: string,
    _originalDraft: string,
  ): void {
    // Live update the field with generated content
    this.storyManager.saveFieldDraft(session.fieldId, accumulated);
  }

  async onComplete(
    session: FieldSession,
    finalResult: string,
  ): Promise<string> {
    await this.storyManager.saveFieldDraft(session.fieldId, finalResult);
    return finalResult;
  }
}

export class RefineStageHandler implements StageHandler {
  constructor(
    private storyManager: StoryManager,
    private contextFactory: ContextStrategyFactory,
    private reviewPatcher: ReviewPatcher,
  ) {}

  async onStart(session: FieldSession): Promise<void> {
    // Strip tags from previous reviews before starting refinement
    this.reviewPatcher.stripTags(session.fieldId);
  }

  onStream(
    _session: FieldSession,
    _delta: string,
    _accumulated: string,
    _originalDraft: string,
  ): void {
    // No-op, managed by overrideGeneration
  }

  async onComplete(
    session: FieldSession,
    finalResult: string,
  ): Promise<string> {
    await this.storyManager.saveFieldDraft(session.fieldId, finalResult);
    return finalResult;
  }

  async overrideGeneration(
    session: FieldSession,
    updateFn: () => void,
  ): Promise<boolean> {
    const reviewContent = session.cycles.review.content;
    const lines = reviewContent.split("\n").filter((l) => l.trim());

    // Use current draft as the base for patching
    let currentText = this.storyManager.getFieldContent(session.fieldId);

    for (const line of lines) {
      if (session.cancellationSignal?.cancelled) break;

      const match = line.match(/^(\*\*)?\[([A-Z_]+)\](\*\*)?\s*\|\|\s*"(.*)"$/);
      if (!match) continue;

      const tag = match[2];
      const locator = match[4];

      // Find locator in the current (possibly already patched) text
      const range = this.reviewPatcher.findLocatorRange(currentText, locator);
      if (!range) {
        api.v1.log(`[Refine] Could not find locator: "${locator}"`);
        continue;
      }

      if (tag === "DELETE") {
        currentText =
          currentText.slice(0, range.start) + currentText.slice(range.end);
        this.storyManager.saveFieldDraft(session.fieldId, currentText);
        updateFn();
        continue;
      }

      // Context building: 100 chars before target
      const prefillStart = Math.max(0, range.start - 100);
      const prefill = currentText.slice(prefillStart, range.start);

      const { messages, params } =
        await this.contextFactory.buildRefinementPatchContext(
          session,
          tag,
          locator,
          prefill,
        );

      const model = (await api.v1.config.get("model")) || "glm-4-6";
      let patch = "";

      try {
        await hyperGenerate(
          messages,
          {
            ...params,
            maxTokens: params.maxTokens || 128,
            minTokens: params.minTokens || 2,
            model,
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
          (delta) => {
            patch += delta;
            // Intermediate visual update: show the patch being applied
            const previewText =
              currentText.slice(0, range.start) +
              patch +
              currentText.slice(range.end);
            this.storyManager.saveFieldDraft(session.fieldId, previewText);
            updateFn();
          },
          "background",
          session.cancellationSignal,
        );

        // Apply the final patch to the currentText for the next iteration
        currentText =
          currentText.slice(0, range.start) +
          patch +
          currentText.slice(range.end);
        this.storyManager.saveFieldDraft(session.fieldId, currentText);
        updateFn();

        // Small sleep to avoid hammer-spamming the server during iterative refinement
        await api.v1.timers.sleep(300);
      } catch (e: any) {
        if (e.message?.includes("cancelled")) break;
        api.v1.log(`[Refine] Patch generation failed: ${e.message}`);
      }
    }

    session.cycles.refine.content = currentText;
    return true;
  }
}

export class ReviewStageHandler implements StageHandler {
  private buffer: string = "";

  constructor(private reviewPatcher: ReviewPatcher) {}

  async onStart(session: FieldSession): Promise<void> {
    this.buffer = ""; // Reset buffer
    this.reviewPatcher.stripTags(session.fieldId);
  }

  onStream(
    session: FieldSession,
    delta: string,
    _accumulated: string,
    _originalDraft: string,
  ): void {
    this.buffer += delta;
    const lines = this.buffer.split("\n");

    // Process complete lines, keep the remainder
    while (lines.length > 1) {
      const line = lines.shift()!;
      this.reviewPatcher.processReviewLine(session.fieldId, line);
    }
    this.buffer = lines[0];
  }

  async onComplete(
    _session: FieldSession,
    finalResult: string,
  ): Promise<string> {
    // Process any remaining buffer
    if (this.buffer.trim()) {
      this.reviewPatcher.processReviewLine(_session.fieldId, this.buffer);
    }

    const cleaned = this.cleanReviewOutput(finalResult);
    api.v1.log(`[Review Stage Completed]:\n${cleaned}`);

    // Review does NOT update the field with its content (the critique),
    // it only patches side-effects.
    return cleaned;
  }

  private cleanReviewOutput(content: string): string {
    const lines = content.split("\n");
    const validLines = lines.filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return false;
      // Validates format: [TAG] || "locator"
      // Allows optional spaces around || and optional markdown bolding **
      return /^(\\*\\*)?\[[A-Z_]+\](\\*\\*)?\s*\|\|\s*".*"$/.test(trimmed);
    });
    return validLines.join("\n");
  }
}
