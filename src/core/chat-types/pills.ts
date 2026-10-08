import { parseForgeStream } from "../utils/crucible-command-parser";
import type { ForgeActionRecord, ForgeSegment, PillPart } from "./types";

/** One pill of a Build reply: a command, or a run of the model's thinking. */
export interface Pill {
  label: string;
  tone: "thinking" | "applied" | "rejected";
  /** Shown when the pill is opened. Empty means the pill does not open,
   *  unless it has a target. */
  body: PillPart[];
  /** The live thing this command made or changed. When it still exists the
   *  opened pill shows its card; `body` is what was written, shown if not. */
  target?: { kind: "entity" | "thread"; id: string };
}

const quoted = (s?: string): string => `"${s ?? ""}"`;

export function pillLabel(action: ForgeActionRecord): string {
  const name = action.name ?? "";
  switch (action.kind) {
    case "CREATE":
      return `+ ${(action.elementType ?? "entity").toLowerCase()} | ${name}`;
    case "REVISE":
      return `~ revised | ${name}`;
    case "THREAD":
      return action.undo?.op === "threadCreated"
        ? `+ thread | ${name}`
        : action.undo?.op === "threadRewritten"
          ? `~ thread | ${name}`
          : `thread | ${name}`;
    case "RENAME":
      return `rename | ${quoted(action.name)} \u2192 ${quoted(action.newName)}`;
    case "DELETE":
      return `\u2212 deleted | ${name}`;
    case "UNKNOWN":
      return "unrecognised";
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
    const applied = action.status === "applied";
    const reversed = action.undoResult === "undone";
    const lead: PillPart[] = !applied
      ? action.reason
        ? [{ label: "Not applied", text: action.reason }]
        : []
      : reversed
        ? [{ label: "Undone", text: "This turn was undone." }]
        : action.undoResult === "skipped"
          ? [
              {
                label: "Not undone",
                text: "Changed since this turn wrote it, so undo left it alone.",
              },
            ]
          : action.undoResult === "failed"
            ? [
                {
                  label: "Undo failed",
                  text: "The lorebook refused. Press Undo again.",
                },
              ]
            : [];
    const replaced: PillPart[] =
      action.undo?.op === "summary"
        ? [{ label: "Replaced", text: action.undo.before }]
        : [];
    const live = applied && !reversed;
    pills.push({
      label: pillLabel(action),
      tone: live ? "applied" : "rejected",
      body: [...lead, ...(action.body ?? []), ...replaced],
      ...(live && action.entityId
        ? { target: { kind: "entity" as const, id: action.entityId } }
        : live && action.threadId
          ? { target: { kind: "thread" as const, id: action.threadId } }
          : {}),
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

/** Why a command nothing settled was not applied. */
const UNSETTLED =
  "This turn did not finish, or the reply was edited after it ran.";

/** The pills for one Build message. Settled segments win. Without them the
 *  content is parsed provisionally: while the reply is `generating` its
 *  commands read as arriving, and once it is not (cancelled, failed or edited)
 *  nothing executed them, so each reads as not applied. */
export function buildPills(
  content: string,
  segments: ForgeSegment[] | undefined,
  generating: boolean,
): Pill[] {
  if (segments) return pillsFor(segments);
  const { segments: parsed, pending } = parseForgeStream(content);
  const tail = pending.kind === "prose" ? pending.text : "";
  if (generating) return pillsFor(parsed, tail, true);
  return pillsFor(
    parsed.map((s) =>
      s.kind === "action"
        ? {
            ...s,
            action: { ...s.action, status: "rejected", reason: UNSETTLED },
          }
        : s,
    ),
    tail,
  );
}
