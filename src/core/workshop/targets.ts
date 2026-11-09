// What a workshop Send is drafting: its label, its save button's wording, and
// the direction a Send uses when the writer typed none.

import type { CanonDoc, DocKind, RootState, Target } from "../store/types";
import { given } from "../text";

export interface KindMeta {
  /** Plural or collective heading for the Canon list: "Locations". */
  heading: string;
  /** What one document of this kind is called on a button: "locations". */
  noun: string;
  /** Default direction; `{title}` is the document's title. */
  direction: string;
}

export const KINDS: Record<DocKind, KindMeta> = {
  geography: {
    heading: "Geography",
    noun: "geography",
    direction:
      "Write the geography of where this story is staged: what lies where, how far apart, how one gets between them.",
  },
  history: {
    heading: "History",
    noun: "history",
    direction:
      "Write the history of this world and place, as deep as a scene could stand on it.",
  },
  culture: {
    heading: "Culture",
    noun: "culture",
    direction:
      "Write the culture here: customs, manners, money, what people expect of each other.",
  },
  tensions: {
    heading: "Tensions",
    noun: "tensions",
    direction:
      "Write the tensions that keep this place from settling: what pulls against what, and who feels it.",
  },
  factions: {
    heading: "Factions",
    noun: "factions",
    direction:
      "Write the factions: who they are, what they want, how they hold power, who belongs.",
  },
  locations: {
    heading: "Locations",
    noun: "locations",
    direction:
      "Write the locations, one section each: what it is like, who is found there and why, what could happen there.",
  },
  relationships: {
    heading: "Relationships",
    noun: "relationships",
    direction:
      "Write how the cast stand with each other: each tie, what it rests on, what strains it.",
  },
  plots: {
    heading: "Plot pressures",
    noun: "plot pressures",
    direction:
      "Write the pressures that could open scenes: open questions and situations that force a choice, never their outcomes.",
  },
  system: {
    heading: "Systems",
    noun: "system",
    direction:
      "Write how {title} works: its rules, its costs, who it touches, what changes it.",
  },
  dossier: {
    heading: "Dossiers",
    noun: "dossier",
    direction:
      "Write {title}'s dossier: appearance, voice, habits and tells, what they want and fear, their history, and their family.",
  },
};

/** Kinds in the order the Canon stage lists them. */
export const KIND_ORDER: readonly DocKind[] = [
  "geography",
  "history",
  "culture",
  "tensions",
  "factions",
  "system",
  "dossier",
  "relationships",
  "locations",
  "plots",
];

export function findDoc(state: RootState, docId: string): CanonDoc | undefined {
  return state.canon.docs.find((d) => d.id === docId);
}

export function sameTarget(a: Target, b: Target): boolean {
  if (a.kind !== b.kind) return false;
  return a.kind !== "doc" || a.docId === (b as { docId: string }).docId;
}

/** "Vignette", "Starting point", "Tam · dossier", "Locations", "Opening". */
export function targetLabel(state: RootState, target: Target): string {
  switch (target.kind) {
    case "vignette":
      return "Vignette";
    case "startingPoint":
      return "Starting point";
    case "opening":
      return "Opening";
    case "doc": {
      const doc = findDoc(state, target.docId);
      if (!doc) return "Missing document";
      return doc.kind === "dossier" || doc.kind === "system"
        ? `${doc.title} · ${KINDS[doc.kind].noun}`
        : doc.title;
    }
  }
}

export function saveLabel(state: RootState, target: Target): string {
  switch (target.kind) {
    case "vignette":
      return "Save vignette";
    case "startingPoint":
      return "Save starting point";
    case "opening":
      return "Keep opening";
    case "doc": {
      const doc = findDoc(state, target.docId);
      return doc ? `Save ${KINDS[doc.kind].noun}` : "Save";
    }
  }
}

/**
 * ", told in third limited, past" from the Brief's voice, or "". Only the
 * voice's first clause: a voice field often goes on ("Third limited, past: we
 * are close to her thoughts…"), and the rest buried the scene it introduced.
 */
function toldIn(state: RootState): string {
  const voice = given(state.canon.brief.voice)
    .split(/[:;.\n]|\s[—–-]\s/)[0]
    .trim();
  return voice
    ? `, told in ${voice.charAt(0).toLowerCase()}${voice.slice(1)}`
    : "";
}

/** A vignette direction from an offer's pitch and the writer's note. */
export function vignetteDirection(
  state: RootState,
  pitch: string,
  note: string,
): string {
  const scene = [pitch.trim(), note.trim()].filter(Boolean).join(" ");
  return scene
    ? `Write a short scene${toldIn(state)}: ${scene}`
    : defaultDirection(state, { kind: "vignette" });
}

export function defaultDirection(state: RootState, target: Target): string {
  switch (target.kind) {
    case "vignette":
      return `Write a short scene${toldIn(state)}.`;
    case "startingPoint":
      return "Write where the story begins, under two headings: Now, what is true at the first page; Not yet, what has not happened.";
    case "opening":
      return `Write the opening scene, as of Now${toldIn(state)}.`;
    case "doc": {
      const doc = findDoc(state, target.docId);
      if (!doc) return "Write.";
      // A document is reference notes; said outright, or the story model
      // writes it as a scene.
      return `${KINDS[doc.kind].direction.replace("{title}", doc.title)} Write it as a reference entry in plain statements, not as a scene.`;
    }
  }
}
