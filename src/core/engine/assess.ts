// The free half of a pass: what is new, and who might be in it.
//
// Pure string work over sections the caller has already read. No generation, so
// this can end a pass at zero cost — which is what makes triage affordable to
// run hot (§3.3).
//
// Candidate matching is cheap and generous on purpose. Precision is triage's
// job. A false candidate costs a few input tokens in the manifest; a missed one
// costs a commitment nobody ever notices.

import type { WorldEntity } from "../store/types";

export type Assessment = {
  /** Unread paragraphs — the pieces of prose below, counted. */
  backlog: number;
  /** Their text, joined — the volatile tail of the triage prompt. */
  newText: string;
  /** Entities the new prose plausibly mentions. */
  candidateIds: string[];
};

/** How far the Engine has read: which section, and how much of it.
 *
 *  The offset is not bookkeeping — it is the whole point. NovelAI resumes
 *  generation INSIDE a section at a character offset (`GenerationPosition` is
 *  `{ sectionId, offset }`), so the trailing paragraph is routinely extended in
 *  place rather than replaced. A watermark that recorded only the section id
 *  would mark that extension as read the moment the section was, and everything
 *  appended to it would be skipped permanently — on this pass and on every later
 *  one. That is the exact loss the "advance only on a completed pass" rule
 *  exists to prevent, arriving by a different door. */
export type Watermark = {
  sectionId: number;
  /** The section's character length when it was read. */
  offset: number;
};

export type AssessInput = {
  sectionIds: number[];
  /** How far the last completed pass read, or null on a branch never assessed. */
  watermark: Watermark | null;
  textBySection: Map<number, string>;
  entities: WorldEntity[];
};

/** Escape a name for use in a RegExp — names are user text and may contain
 *  anything. Unescaped, "C++" is a syntax error and "(redacted)" is a capture
 *  group. */
function escape(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whole-word matcher for a name, anchored only where an anchor can exist.
 *
 *  `\b` is a transition between a word and a non-word character, so demanding
 *  one on both sides of a name like "C++" or "(redacted)" can never match — the
 *  character outside the name is a space and the one inside is punctuation,
 *  which is no transition at all. Anchor each end only when that end is a word
 *  character: "Ada" still gets both anchors and cannot fire on "Adamant", while
 *  a punctuated name degrades to a literal search rather than to nothing. */
function wholeWord(name: string): RegExp {
  const left = /^\w/.test(name) ? "\\b" : "";
  const right = /\w$/.test(name) ? "\\b" : "";
  return new RegExp(`${left}${escape(name)}${right}`, "i");
}

export function assess(input: AssessInput): Assessment {
  const { sectionIds, watermark, textBySection, entities } = input;

  // A watermark the document no longer contains means the writer undid or
  // deleted past it. Treat everything as unseen: re-reading is cheap, and
  // skipping prose because of a dangling id loses commitments silently.
  const at = watermark === null ? -1 : sectionIds.indexOf(watermark.sectionId);

  // The tail first: what was appended to the watermarked section since it was
  // read. `slice` past the end yields "" rather than a negative window, so a
  // section the writer SHORTENED contributes nothing rather than re-reading
  // backwards.
  const tail =
    watermark === null || at === -1
      ? ""
      : (textBySection.get(watermark.sectionId) ?? "").slice(watermark.offset);

  const fresh = sectionIds
    .slice(at + 1)
    .map((id) => textBySection.get(id) ?? "");

  // The tail joins ahead of the sections that follow it — document order, which
  // is the payload of this string rather than a detail of it.
  const pieces = [tail, ...fresh]
    .map((text) => text.trim())
    // What contributes no text is not unread prose. Counting it would clear
    // the minimum-new-prose gate on a run of blank paragraphs and spend the
    // pass's one generation on an empty NEW PROSE block.
    .filter((text) => text.length > 0);

  const newText = pieces.join("\n\n");

  const candidateIds = entities
    .filter((e) => {
      const name = e.name.trim();
      if (name.length === 0) return false;
      return wholeWord(name).test(newText);
    })
    .map((e) => e.id);

  return { backlog: pieces.length, newText, candidateIds };
}
