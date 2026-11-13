// Has a Draft run's model fallen into a spiral: restating one beat in ever
// shorter sentences, with no paragraph break and no dialogue? Plain arithmetic
// on the text, no model call. Verbatim repetition does not catch it: a spiral
// rephrases ("Life was good. Life was very, very good."), and exact word
// triples stayed under 15% in one. Its shape does: measured on a draft whose
// second half spiralled, healthy prose ran 48–83 characters a sentence, 0–14%
// of sentences reopening the same way and 0–11% of content words used three
// times or more; the spiral ran 26–34, 18–33% and 12–19%, with no line break.

/** A paragraph this long, with no break, may be a spiral. */
export const SPIRAL_PARAGRAPH = 1500;
/** How much of the paragraph's end is measured: about one Send. */
const WINDOW = 1000;

const COMMON = new Set(
  (
    "the a an and or but of to in on at for with as is was were be been it its " +
    "he she his her him they them their i you we this that so very not no yes " +
    "then than there here from by up out into over just all one what would " +
    "could had has have did do does said if when while who which"
  ).split(" "),
);

/** A rough stem, so "perfect" and "perfectly" count as one word. */
const stem = (word: string) =>
  word.replace(/(ingly|edly|ing|ed|ly|es|s)$/, "") || word;

const wordsOf = (text: string) => text.toLowerCase().match(/[a-z']+/g) ?? [];

export interface SpiralScores {
  /** Average characters per sentence. */
  sentenceLength: number;
  /** Share of sentences opening with two words an earlier one opened with. */
  repeatedStarts: number;
  /** Share of content words used three times or more. */
  recycledWords: number;
}

export function spiralScores(text: string): SpiralScores {
  const sentences = text
    .split(/(?<=[.!?…]["”'’*]?)\s+/)
    .filter((s) => /[a-z]/i.test(s));
  const starts = sentences.map((s) => wordsOf(s).slice(0, 2).join(" "));
  const repeated = starts.filter((s, i) => starts.indexOf(s) !== i).length;
  const content = wordsOf(text)
    .filter((w) => !COMMON.has(w))
    .map(stem);
  const counts = new Map<string, number>();
  for (const w of content) counts.set(w, (counts.get(w) ?? 0) + 1);
  const recycled = content.filter((w) => (counts.get(w) ?? 0) >= 3).length;
  return {
    sentenceLength: text.length / Math.max(1, sentences.length),
    repeatedStarts: repeated / Math.max(1, sentences.length),
    recycledWords: recycled / Math.max(1, content.length),
  };
}

/**
 * The draft's last paragraph, measured, when it is long enough to be a spiral;
 * null otherwise. A long paragraph alone is not one: description runs long
 * with whole sentences, and short tense sentences still break lines.
 */
export function spiral(
  draft: string,
): { scores: SpiralScores; spiralling: boolean } | null {
  const paragraph = draft.slice(draft.lastIndexOf("\n") + 1);
  if (paragraph.length < SPIRAL_PARAGRAPH) return null;
  const scores = spiralScores(paragraph.slice(-WINDOW));
  return {
    scores,
    spiralling:
      scores.sentenceLength < 35 ||
      scores.repeatedStarts > 0.15 ||
      scores.recycledWords > 0.1,
  };
}
