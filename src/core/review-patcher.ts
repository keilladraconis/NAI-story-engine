import { StoryManager } from "./story-manager";

export class ReviewPatcher {
  constructor(private storyManager: StoryManager) {}

  public stripTags(fieldId: string): void {
    const currentDraft = this.storyManager.getFieldContent(fieldId);
    const tagRegex = /\[[A-Z_]+\] /g;

    if (tagRegex.test(currentDraft)) {
      const cleanDraft = currentDraft.replace(tagRegex, "");
      this.storyManager.saveFieldDraft(fieldId, cleanDraft);
    }
  }

  public processReviewLine(fieldId: string, line: string): void {
    const trimmed = line.trim();
    // Validates format: [TAG] || "locator"
    // Allows optional spaces around || and optional markdown bolding **
    const match = trimmed.match(
      /^(\*\*)?\[([A-Z_]+)\](\*\*)?\s*\|\|\s*"(.*)"$/,
    );

    if (!match) return;

    const tag = match[2];
    const rawLocator = match[4];

    const pattern = this.buildFuzzyPattern(rawLocator);
    if (!pattern) return;

    try {
      this.applyPatch(fieldId, pattern, tag, rawLocator);
    } catch (e) {
      api.v1.log(`[ReviewPatcher] Regex Error: ${e}`);
    }
  }

  public findLocatorRange(
    text: string,
    locator: string,
  ): { start: number; end: number } | null {
    const pattern = this.buildFuzzyPattern(locator);
    if (!pattern) return null;

    try {
      const regex = new RegExp(pattern, "i");
      const match = regex.exec(text);
      if (match) {
        return {
          start: match.index,
          end: match.index + match[0].length,
        };
      }
    } catch (e) {
      api.v1.log(`[ReviewPatcher] findLocatorRange Regex Error: ${e}`);
    }
    return null;
  }

  private buildFuzzyPattern(locator: string): string | null {
    // 1. Split locator into tokens
    const tokens = locator.trim().split(/\s+/);
    if (tokens.length === 0) return null;

    // 2. Take all words (up to a reasonable limit to avoid crazy regex)
    const searchTokens = tokens.slice(0, 15);

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

  private applyPatch(
    fieldId: string,
    pattern: string,
    tag: string,
    rawLocator: string,
  ): void {
    const regex = new RegExp(pattern, "i"); // Case insensitive
    const currentDraft = this.storyManager.getFieldContent(fieldId);
    const searchMatch = regex.exec(currentDraft);

    if (searchMatch) {
      const absoluteIdx = searchMatch.index;

      const tagInsert = `[${tag}] `;
      const newDraft =
        currentDraft.slice(0, absoluteIdx) +
        tagInsert +
        currentDraft.slice(absoluteIdx);

      this.storyManager.saveFieldDraft(fieldId, newDraft);
    } else {
      api.v1.log(`[ReviewPatcher] Failed to find locator: "${rawLocator}"`);
    }
  }
}
