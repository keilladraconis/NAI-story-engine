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
  /** Sections past the watermark. */
  backlog: number;
  /** Their text, joined — the volatile tail of the triage prompt. */
  newText: string;
  /** Entities the new prose plausibly mentions. */
  candidateIds: string[];
};

export type AssessInput = {
  sectionIds: number[];
  /** The last section observed, or null on a branch never assessed. */
  watermark: number | null;
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
  const at = watermark === null ? -1 : sectionIds.indexOf(watermark);
  const fresh = sectionIds.slice(at + 1);

  const newText = fresh
    .map((id) => textBySection.get(id) ?? "")
    .filter((t) => t.length > 0)
    .join("\n\n");

  const candidateIds = entities
    .filter((e) => {
      const name = e.name.trim();
      if (name.length === 0) return false;
      return wholeWord(name).test(newText);
    })
    .map((e) => e.id);

  return { backlog: fresh.length, newText, candidateIds };
}
