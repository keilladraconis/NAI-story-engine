/**
 * SeForgeMessageView — builds the interleaved view for a forge turn: prose runs
 * as markdown text parts, actions as compact chip rows, in document order.
 * Pure builders (no SuiComponent) so SeMessage can drop the parts straight into
 * SeEditableText's viewParts slot.
 */

import type {
  ForgeSegment,
  ForgeActionRecord,
} from "../../core/chat-types/types";
import type { ForgeStreamParse } from "../../core/utils/crucible-command-parser";

const ELEMENT_LABEL: Record<string, string> = {
  CHARACTER: "Character",
  LOCATION: "Location",
  FACTION: "Faction",
  SYSTEM: "System",
  SITUATION: "Situation",
  TOPIC: "Topic",
};

const ATTEMPT_VERB: Record<ForgeActionRecord["kind"], string> = {
  CREATE: "Create",
  REVISE: "Revise",
  DELETE: "Delete",
  RENAME: "Rename",
  THREAD: "Thread",
  CRITIQUE: "Critique",
  UNKNOWN: "Action",
};

/** Map an outcome record to a chip icon + label. Pure. */
export function formatForgeChip(a: ForgeActionRecord): {
  icon: string;
  label: string;
} {
  if (a.status === "unrecognized") {
    return { icon: "⚠️", label: `Unrecognized · ${a.reason ?? ""}`.trimEnd() };
  }
  if (a.status === "rejected") {
    const verb = ATTEMPT_VERB[a.kind] ?? "Action";
    const who = a.name ?? "";
    return {
      icon: "⚠️",
      label: a.reason ? `${verb} · ${who} — ${a.reason}` : `${verb} · ${who}`,
    };
  }
  switch (a.kind) {
    case "CREATE": {
      const type =
        ELEMENT_LABEL[a.elementType ?? ""] ?? a.elementType ?? "Entity";
      return { icon: "➕", label: `${type} · ${a.name ?? ""}` };
    }
    case "REVISE":
      return { icon: "✏️", label: `Revised · ${a.name ?? ""}` };
    case "DELETE":
      return { icon: "🗑", label: `Deleted · ${a.name ?? ""}` };
    case "RENAME":
      return {
        icon: "✏️",
        label: `Renamed · ${a.name ?? ""} → ${a.newName ?? ""}`,
      };
    case "THREAD":
      return { icon: "🧵", label: `Thread · ${a.name ?? ""}` };
    case "CRITIQUE":
      return { icon: "💬", label: `Critique: ${a.text ?? ""}` };
    default:
      return { icon: "•", label: a.name ?? "" };
  }
}

const PROSE_STYLE = {
  "font-size": "0.85em",
  "white-space": "pre-wrap",
  "word-break": "break-word",
} as const;

const CHIP_ROW_STYLE = {
  "align-items": "flex-start",
  gap: "6px",
  padding: "3px 8px",
  margin: "2px 0",
  "border-radius": "6px",
  "background-color": "rgba(255,255,255,0.06)",
  "font-size": "0.8em",
} as const;

const PENDING_CHIP_STYLE = { ...CHIP_ROW_STYLE, opacity: "0.55" } as const;

const WAIT_HINT_STYLE = {
  "align-items": "flex-start",
  gap: "6px",
  padding: "3px 8px",
  margin: "2px 0",
  "border-radius": "6px",
  "background-color": "rgba(255,255,255,0.04)",
  "font-size": "0.8em",
  "font-style": "italic",
  opacity: "0.7",
} as const;

/**
 * Why a forge turn is sitting empty. Lets the streaming view show a "paused, not
 * crashed" hint while the GenX budget bucket is awaiting (`budget`) or a presence
 * interaction (`user`). The authoritative Continue button / live countdown lives
 * in the bottom bar (SeBudgetFeedback); this is just the in-bubble explanation.
 */
export type BudgetWaitHint = "none" | "budget" | "user";

const WAIT_HINT_COPY: Record<
  Exclude<BudgetWaitHint, "none">,
  { icon: string; label: string }
> = {
  budget: {
    icon: "⏳",
    label: "Output token budget exhausted — waiting for more tokens…",
  },
  user: {
    icon: "⏸",
    label:
      "Output token budget exhausted — press Continue (below) to wait for more tokens.",
  },
};

/** Streaming view: settled prose+chips, plus a live tail (prose / pending chip).
 *  When the turn is still empty and GenX is awaiting budget/presence, show a
 *  "paused" hint so the empty bubble does not read as a crash. */
export function buildForgeStreamView(
  parse: ForgeStreamParse,
  idPrefix: string,
  budgetWait: BudgetWaitHint = "none",
): UIPart[] {
  const { row, text } = api.v1.ui.part;
  const parts = buildForgeMessageView(parse.segments, idPrefix);
  const { pending } = parse;
  if (pending.kind === "prose") {
    const escaped = pending.text.replace(/\n/g, "  \n").replace(/</g, "\\<");
    parts.push(
      text({
        id: `${idPrefix}-tail`,
        text: escaped,
        markdown: true,
        style: PROSE_STYLE,
      }),
    );
  } else if (pending.kind === "buffering") {
    parts.push(
      row({
        id: `${idPrefix}-pending`,
        style: PENDING_CHIP_STYLE,
        content: [
          text({ id: `${idPrefix}-pending-icon`, text: "⏳" }),
          text({
            id: `${idPrefix}-pending-label`,
            text: "…",
            style: { flex: "1" },
          }),
        ],
      }),
    );
  }

  // Empty turn while the budget bucket is awaiting: surface a "paused" hint in
  // place of a blank bubble. Only when nothing has streamed yet — a turn that
  // already has chips/prose reads as in-progress on its own.
  const isEmpty = parse.segments.length === 0 && pending.kind === "none";
  if (isEmpty && budgetWait !== "none") {
    const copy = WAIT_HINT_COPY[budgetWait];
    parts.push(
      row({
        id: `${idPrefix}-budget-wait`,
        style: WAIT_HINT_STYLE,
        content: [
          text({ id: `${idPrefix}-budget-wait-icon`, text: copy.icon }),
          text({
            id: `${idPrefix}-budget-wait-label`,
            text: copy.label,
            style: { flex: "1" },
          }),
        ],
      }),
    );
  }
  return parts;
}

/** Build the ordered view parts for SeEditableText.viewParts. */
export function buildForgeMessageView(
  segments: ForgeSegment[],
  idPrefix: string,
): UIPart[] {
  const { row, text } = api.v1.ui.part;
  return segments.map((seg, i) => {
    if (seg.kind === "prose") {
      const escaped = seg.text.replace(/\n/g, "  \n").replace(/</g, "\\<");
      return text({
        id: `${idPrefix}-seg-${i}`,
        text: escaped,
        markdown: true,
        style: PROSE_STYLE,
      });
    }
    const { icon, label } = formatForgeChip(seg.action);
    return row({
      id: `${idPrefix}-seg-${i}`,
      style: CHIP_ROW_STYLE,
      content: [
        text({ id: `${idPrefix}-seg-${i}-icon`, text: icon }),
        text({
          id: `${idPrefix}-seg-${i}-label`,
          text: label,
          style: { flex: "1" },
        }),
      ],
    });
  });
}
