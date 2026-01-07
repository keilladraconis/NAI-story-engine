import { StoryManager } from "./story-manager";

export interface PatchEntry {
  tags: string[];
  locator: string;
  range: { start: number; end: number };
}

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

  /**
   * Parses review content into PatchEntries, finding their ranges in the original text.
   */
  public getPatchesFromReview(
    reviewContent: string,
    originalText: string,
  ): PatchEntry[] {
    const lines = reviewContent.split("\n").filter((l) => l.trim());

    return lines
      .map((line) => {
        const match = line.match(
          /^(\*\*)?((?:\[[A-Z_]+\])+)(\*\*)?\s*\|\|\s*"(.*)"$/,
        );
        if (!match) return null;
        const tagsMatch = match[2];
        const tags = tagsMatch.slice(1, -1).split("][");
        const locator = match[4];
        const range = this.findLocatorRange(originalText, locator);
        return range ? { tags, locator, range } : null;
      })
      .filter((p): p is PatchEntry => !!p);
  }

  /**
   * Merges overlapping or identical ranges in a list of PatchEntries.
   */
  public mergePatches(
    patches: PatchEntry[],
    originalText: string,
  ): PatchEntry[] {
    if (patches.length === 0) return [];

    // Sort by start position to detect overlaps
    const sorted = [...patches].sort((a, b) => a.range.start - b.range.start);
    const merged: PatchEntry[] = [];

    for (const patch of sorted) {
      const last = merged[merged.length - 1];
      if (last && patch.range.start < last.range.end) {
        // Overlap detected: extend range and add tags
        last.range.end = Math.max(last.range.end, patch.range.end);
        for (const t of patch.tags) {
          if (!last.tags.includes(t)) {
            last.tags.push(t);
          }
        }
        // Update locator to the full merged text
        last.locator = originalText.slice(last.range.start, last.range.end);
      } else {
        merged.push({
          tags: [...patch.tags],
          locator: patch.locator,
          range: { ...patch.range },
        });
      }
    }

    return merged;
  }

  /**
   * Cleans a generated patch by removing common model prefixes and accidental artifacts.
   */
  public cleanPatch(patch: string, locator: string, tags: string[]): string {
    let cleaned = patch.trim();

    // 1. Remove common prefixes
    const prefixes = [
      "REPLACEMENT TEXT:",
      "REPLACEMENT:",
      "OUTPUT:",
      "FINAL TEXT:",
      "FIXED TEXT:",
      "NEW TEXT:",
      ...tags.map((t) => `REPLACEMENT FOR [${t}]:`),
    ];

    for (const pref of prefixes) {
      if (cleaned.toUpperCase().startsWith(pref)) {
        cleaned = cleaned.slice(pref.length).trim();
      }
    }

    // 2. Strip accidental surrounding quotes if model added them but they weren't in locator
    if (
      cleaned.startsWith('"') &&
      cleaned.endsWith('"') &&
      !locator.startsWith('"')
    ) {
      cleaned = cleaned.slice(1, -1).trim();
    }

    // 3. If the model repeats the locator itself at the start, strip it
    if (cleaned.startsWith(locator) && cleaned.length > locator.length) {
      const remainder = cleaned.slice(locator.length).trim();
      // If it starts with a transition word like "is" or ":" we might have caught a partial repeat
      if (remainder.startsWith(":") || remainder.startsWith(" -")) {
        cleaned = remainder.slice(1).trim();
      }
    }

    return cleaned;
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
