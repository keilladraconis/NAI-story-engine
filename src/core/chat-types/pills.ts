import type { ForgeActionRecord, ForgeSegment, PillPart } from "./types";

/** One pill of a Build reply: a command, or a run of the model's thinking. */
export interface Pill {
  label: string;
  tone: "thinking" | "applied" | "rejected";
  /** Shown when the pill is opened. Empty means the pill does not open. */
  body: PillPart[];
}

const quoted = (s?: string): string => `"${s ?? ""}"`;

export function pillLabel(action: ForgeActionRecord): string {
  switch (action.kind) {
    case "RENAME":
      return `rename | ${quoted(action.name)} → ${quoted(action.newName)}`;
    case "UNKNOWN":
      return "unrecognised";
    default:
      return `${action.kind.toLowerCase()} | ${quoted(action.name)}`;
  }
}

/** A Build reply as pills, in the order it was written. Everything that is not
 *  a command is thinking, wherever it sits: this is positional, and no marker
 *  is looked for. `tail` is the unfinished text of a reply still arriving. */
export function pillsFor(
  segments: ForgeSegment[],
  tail = "",
  streaming = false,
): Pill[] {
  const pills: Pill[] = [];
  const think = (text: string): void => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const last = pills[pills.length - 1];
    if (last?.tone === "thinking") {
      last.body[0].text += `\n${trimmed}`;
      return;
    }
    pills.push({
      label: "thinking",
      tone: "thinking",
      body: [{ label: "", text: trimmed }],
    });
  };

  for (const segment of segments) {
    if (segment.kind === "prose") {
      think(segment.text);
      continue;
    }
    const { action } = segment;
    const failed = action.status !== "applied";
    pills.push({
      label: pillLabel(action),
      tone: failed ? "rejected" : "applied",
      body: [
        ...(failed && action.reason
          ? [{ label: "Not applied", text: action.reason }]
          : []),
        ...(action.body ?? []),
      ],
    });
  }
  think(tail);

  if (streaming && pills.every((p) => p.tone === "thinking")) {
    if (pills.length === 0) {
      pills.push({ label: "thinking…", tone: "thinking", body: [] });
    } else {
      pills[0].label = "thinking…";
    }
  }
  return pills;
}
