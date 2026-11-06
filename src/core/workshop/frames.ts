// The frame: what a workshop Send is shown in place of Memory. It reads like a
// story's notes, not like instructions: the editor model is a story model, and a
// basic direction after the frame is all the instruction it gets.
//
// Limits stay out of it. Telling a story model what must not happen puts the
// thing in its context; the critic checks limits instead.

import type { Brief, CanonDoc, RootState, Target } from "../store/types";
import { KINDS } from "./targets";
import { given } from "../text";

/** Characters a frame may hold before its lowest-priority parts are dropped. */
export const FRAME_BUDGET = 16000;

/** `[ Title: …; Genre: … ]` from the Brief, or "" when both are empty. */
export function attgLine(brief: Brief): string {
  // `;` separates the line's fields, so a writer's `;` inside one becomes `,`.
  const clean = (s: string) => given(s).replace(/\s*;\s*/g, ", ");
  const parts = [
    clean(brief.title) && `Title: ${clean(brief.title)}`,
    clean(brief.genre) && `Genre: ${clean(brief.genre)}`,
  ].filter(Boolean);
  return parts.length ? `[ ${parts.join("; ")} ]` : "";
}

function briefBlock(brief: Brief): string {
  const tone = [given(brief.heat), given(brief.pace)]
    .filter(Boolean)
    .join("; ");
  return [
    attgLine(brief),
    given(brief.premise),
    given(brief.world) && `The world: ${given(brief.world)}`,
    // Desires say what the scenario must allow; framed as such so a story
    // model does not read them as things that have happened.
    given(brief.desires) &&
      `What this story dwells on (what it must allow, not what has happened):\n${given(brief.desires)}`,
    given(brief.voice) && `Told in: ${given(brief.voice)}.`,
    tone && `Tone: ${tone}.`,
  ]
    .filter(Boolean)
    .join("\n");
}

function startingBlock(state: RootState): string {
  const { now, notYet } = state.canon.startingPoint;
  return [
    now.trim() && `Now:\n${now.trim()}`,
    notYet.trim() && `Not yet:\n${notYet.trim()}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function vignettesBlock(state: RootState): string {
  if (!state.canon.vignettes.length) return "";
  return [
    "Tone samples (how the story should read, not things that have happened):",
    ...state.canon.vignettes.map((v) => v.text.trim()),
  ].join("\n\n");
}

export function docHeading(doc: CanonDoc): string {
  return doc.kind === "dossier" || doc.kind === "system"
    ? `${doc.title} (${KINDS[doc.kind].noun})`
    : doc.title;
}

function docBlock(doc: CanonDoc): string {
  return `## ${docHeading(doc)}\n${doc.text.trim()}`;
}

/**
 * Join blocks in priority order and drop from the end until the frame fits.
 * The first block (the Brief) is always kept.
 */
export function fit(blocks: string[], budget = FRAME_BUDGET): string {
  const kept = blocks.filter((b) => b.trim());
  while (kept.length > 1 && kept.join("\n\n").length > budget) kept.pop();
  return kept.join("\n\n");
}

export function buildFrame(state: RootState, target: Target): string {
  const brief = briefBlock(state.canon.brief);
  switch (target.kind) {
    case "vignette":
      return fit([brief]);
    case "startingPoint":
      return fit([brief, vignettesBlock(state)]);
    case "doc": {
      const others = state.canon.docs
        .filter((d) => d.id !== target.docId && d.text.trim())
        .map(docBlock);
      return fit([
        brief,
        startingBlock(state),
        ...others,
        vignettesBlock(state),
      ]);
    }
    case "opening":
      // The opening uses NovelAI's own context; it has no frame.
      return "";
  }
}
