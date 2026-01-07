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
    // Validates format: [TAG1][TAG2] || "locator"
    const match = trimmed.match(
      /^(\*\*)?((?:\[[A-Z_]+\])+)(\*\*)?\s*\|\|\s*"(.*)"$/,
    );

    if (!match) return;

    const tagsStr = match[2];
    const rawLocator = match[4];

    // Safeguard: Single-word locators for FLUFF are usually counter-productive
    // and lead to text mangling. We require at least two words for these tags.
    if (tagsStr.includes("FLUFF") && !rawLocator.trim().includes(" ")) {
      return;
    }

    const pattern = this.buildFuzzyPattern(rawLocator);
    if (!pattern) return;

    try {
      // For visual feedback in the text during review, we just insert the tags string
      this.applyPatch(fieldId, pattern, tagsStr, rawLocator);
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
        let start = match.index;
        let end = match.index + match[0].length;

        // Expand to include surrounding markdown
        while (start > 0 && /[*_~`]/.test(text[start - 1])) start--;
        while (end < text.length && /[*_~`]/.test(text[end])) end++;

        // If the match ends at a word boundary but there's a trailing punctuation
        // that looks like it belongs to the sentence we're replacing, consume it.
        // But only if the locator itself didn't already have punctuation at the end.
        if (
          !/[\.\!\?]$/.test(match[0]) &&
          end < text.length &&
          /[\.\!\?]/.test(text[end])
        ) {
          end++;
        }

        return { start, end };
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

    // 2. Use up to 100 tokens to ensure we cover the full span
    const searchTokens = tokens.slice(0, 100);

    // 3. Create pattern parts
    const regexParts = searchTokens.map((token) => {
      // Replace any non-alphanumeric character with '.' (wildcard)
      // but escape it if it's a special regex char that we want to treat as a wildcard
      return token
        .split("")
        .map((char) => (/\w/.test(char) ? char : "[\\W_]"))
        .join("");
    });

    // 4. Join with fuzzy separator (allowing whitespace, markdown, punctuation, and slight gaps)
    // We allow 0-20 characters of non-word stuff between tokens to account for heavy markdown
    return regexParts.join("[\\W\\s]{0,20}");
  }

  private applyPatch(
    fieldId: string,
    pattern: string,
    tagsStr: string,
    rawLocator: string,
  ): void {
    const regex = new RegExp(pattern, "i"); // Case insensitive
    const currentDraft = this.storyManager.getFieldContent(fieldId);
    const searchMatch = regex.exec(currentDraft);

    if (searchMatch) {
      const absoluteIdx = searchMatch.index;

      const tagInsert = `${tagsStr} `;
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
