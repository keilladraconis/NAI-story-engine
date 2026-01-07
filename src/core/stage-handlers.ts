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
    const originalText = currentText;

    // Pre-parse patches and find their locations in the original text
    const patches = lines
      .map((line) => {
        const match = line.match(
          /^(\*\*)?\[([A-Z_]+)\](\*\*)?\s*\|\|\s*"(.*)"$/,
        );
        if (!match) return null;
        const tag = match[2];
        const locator = match[4];
        const range = this.reviewPatcher.findLocatorRange(originalText, locator);
        return { tag, locator, range };
      })
      .filter((p): p is { tag: string; locator: string; range: { start: number; end: number } } => !!(p && p.range));

    // Sort patches from END to START. 
    // This ensures that modifying the text doesn't invalidate the indices of patches that come earlier.
    patches.sort((a, b) => b.range.start - a.range.start);

    for (const entry of patches) {
      if (session.cancellationSignal?.cancelled) break;

      const { tag, locator, range } = entry;

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
            // Clean patch: remove prefixes if model repeated them
            let cleanPatch = patch.trim();
            const prefixes = [
              "REPLACEMENT TEXT:",
              "REPLACEMENT:",
              "OUTPUT:",
              "FINAL TEXT:",
              "FIXED TEXT:",
              "NEW TEXT:",
              `REPLACEMENT FOR [${tag}]:`,
            ];
            for (const pref of prefixes) {
              if (cleanPatch.toUpperCase().startsWith(pref)) {
                cleanPatch = cleanPatch.slice(pref.length).trim();
              }
            }

            // Strip accidental surrounding quotes if model added them but they weren't in locator
            if (
              cleanPatch.startsWith('"') &&
              cleanPatch.endsWith('"') &&
              !locator.startsWith('"')
            ) {
              cleanPatch = cleanPatch.slice(1, -1).trim();
            }

            // If the model repeats the locator itself at the start, strip it
            if (cleanPatch.startsWith(locator) && cleanPatch.length > locator.length) {
                const remainder = cleanPatch.slice(locator.length).trim();
                // If it starts with a transition word like "is" or ":" we might have caught a partial repeat
                if (remainder.startsWith(":") || remainder.startsWith(" -")) {
                    cleanPatch = remainder.slice(1).trim();
                }
            }

            // Intermediate visual update: show the patch being applied
            const previewText =
              currentText.slice(0, range.start) +
              cleanPatch +
              currentText.slice(range.end);
            this.storyManager.saveFieldDraft(session.fieldId, previewText);
            updateFn();
          },
          "background",
          session.cancellationSignal,
        );

        // Clean final patch
        let finalPatch = patch.trim();
        const prefixes = [
          "REPLACEMENT TEXT:",
          "REPLACEMENT:",
          "OUTPUT:",
          "FINAL TEXT:",
          "FIXED TEXT:",
          "NEW TEXT:",
          `REPLACEMENT FOR [${tag}]:`,
        ];
        for (const pref of prefixes) {
          if (finalPatch.toUpperCase().startsWith(pref)) {
            finalPatch = finalPatch.slice(pref.length).trim();
          }
        }

        // Strip accidental surrounding quotes
        if (
          finalPatch.startsWith('"') &&
          finalPatch.endsWith('"') &&
          !locator.startsWith('"')
        ) {
          finalPatch = finalPatch.slice(1, -1).trim();
        }

        // Final check for locator repetition
        if (finalPatch.startsWith(locator) && finalPatch.length > locator.length) {
             const remainder = finalPatch.slice(locator.length).trim();
             if (remainder.startsWith(":") || remainder.startsWith(" -")) {
                finalPatch = remainder.slice(1).trim();
             }
        }

        // Apply the final patch to the currentText for the next iteration
        currentText =
          currentText.slice(0, range.start) +
          finalPatch +
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
