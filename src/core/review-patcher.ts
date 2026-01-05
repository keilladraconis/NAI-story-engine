import { StoryManager } from "./story-manager";

export class ReviewPatcher {
  constructor(private storyManager: StoryManager) {}

  public stripTags(fieldId: string): void {
    const currentDraft = this.storyManager.getFieldContent(fieldId);
    const tagRegex = /\[[A-Z_]+\] /g;
    
    if (tagRegex.test(currentDraft)) {
      api.v1.log("[ReviewPatcher] Stripping existing tags before Review.");
      const cleanDraft = currentDraft.replace(tagRegex, "");
      this.storyManager.saveFieldDraft(fieldId, cleanDraft);
    }
  }

  public processReviewLine(fieldId: string, line: string): void {
    const trimmed = line.trim();
    // Validates format: [TAG] || "locator"
    // Allows optional spaces around || and optional markdown bolding **
    const match = trimmed.match(/^(\*\*)?\[([A-Z_]+)\](\*\*)?\s*\|\|\s*"(.*)"$/);
    
    if (!match) return;

    const tag = match[2];
    const rawLocator = match[4];

    api.v1.log(`[ReviewPatcher] Processing: [${tag}] || "${rawLocator}"`);

    const pattern = this.buildFuzzyPattern(rawLocator);
    if (!pattern) return;

    api.v1.log(`[ReviewPatcher] Prefix Pattern: ${pattern}`);

    try {
      this.applyPatch(fieldId, pattern, tag, rawLocator);
    } catch (e) {
      api.v1.log(`[ReviewPatcher] Regex Error: ${e}`);
    }
  }

  private buildFuzzyPattern(locator: string): string | null {
    // 1. Split locator into tokens
    const tokens = locator.trim().split(/\s+/);
    if (tokens.length === 0) return null;

    // 2. Take first 5 words
    const searchTokens = tokens.slice(0, 5);

    // 3. Create pattern parts
    const regexParts = searchTokens.map((token) => {
      // Replace any non-alphanumeric character with '.' (wildcard)
      return token
        .split("")
        .map((char) => (/\w/.test(char) ? char : "."))
        .join("");
    });

    // 4. Join with fuzzy separator (allowing whitespace, markdown, punctuation)
    return regexParts.join("[\\W\\s]+");
  }

  private applyPatch(fieldId: string, pattern: string, tag: string, rawLocator: string): void {
    const regex = new RegExp(pattern, "i"); // Case insensitive
    const currentDraft = this.storyManager.getFieldContent(fieldId);
    const searchMatch = regex.exec(currentDraft);

    if (searchMatch) {
      const matchedText = searchMatch[0];
      const absoluteIdx = searchMatch.index;

      api.v1.log(
        `[ReviewPatcher] Found match: "${matchedText.substring(0, 20)}"... at index ${absoluteIdx}`,
      );

      const tagInsert = `[${tag}] `;
      const newDraft = 
        currentDraft.slice(0, absoluteIdx) +
        tagInsert +
        currentDraft.slice(absoluteIdx);
      
      this.storyManager.saveFieldDraft(fieldId, newDraft);
    } else {
      api.v1.log(
        `[ReviewPatcher] Failed to find locator: "${rawLocator}"`, 
      );
    }
  }
}
