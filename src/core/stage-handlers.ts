import { StoryManager } from "./story-manager";
import { ReviewPatcher } from "./review-patcher";
import { FieldSession } from "./agent-cycle";

export interface StageHandler {
  onStart(session: FieldSession): Promise<void>;
  onStream(
    session: FieldSession,
    delta: string,
    accumulated: string,
    originalDraft: string
  ): void;
  onComplete(session: FieldSession, finalResult: string): Promise<string>;
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
    _originalDraft: string
  ): void {
    // Live update the field with generated content
    this.storyManager.saveFieldDraft(session.fieldId, accumulated);
  }

  async onComplete(session: FieldSession, finalResult: string): Promise<string> {
    await this.storyManager.saveFieldDraft(session.fieldId, finalResult);
    return finalResult;
  }
}

export class RefineStageHandler implements StageHandler {
  constructor(private storyManager: StoryManager) {}

  async onStart(_session: FieldSession): Promise<void> {
    // No-op start
  }

  onStream(
    session: FieldSession,
    _delta: string,
    accumulated: string,
    originalDraft: string
  ): void {
    // Visual overwrite effect: New Content + Cursor + Remaining Old Content
    const newLen = accumulated.length;
    const tail = originalDraft.slice(newLen);
    this.storyManager.saveFieldDraft(
      session.fieldId,
      accumulated + "✍️" + tail
    );
  }

  async onComplete(session: FieldSession, finalResult: string): Promise<string> {
    await this.storyManager.saveFieldDraft(session.fieldId, finalResult);
    return finalResult;
  }
}

export class ReviewStageHandler implements StageHandler {
  private buffer: string = "";

  constructor(
    private reviewPatcher: ReviewPatcher
  ) {}

  async onStart(session: FieldSession): Promise<void> {
    this.buffer = ""; // Reset buffer
    this.reviewPatcher.stripTags(session.fieldId);
  }

  onStream(
    session: FieldSession,
    delta: string,
    _accumulated: string,
    _originalDraft: string
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

  async onComplete(_session: FieldSession, finalResult: string): Promise<string> {
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
