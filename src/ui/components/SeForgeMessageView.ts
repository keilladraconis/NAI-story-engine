/**
 * SeForgeMessageView — builds the interleaved view for a forge turn: prose runs
 * as markdown text parts, actions as compact chip rows, in document order.
 * Pure builders (no SuiComponent) so SeMessage can drop the parts straight into
 * SeEditableText's viewParts slot.
 */

import type { ForgeSegment, ForgeActionRecord } from "../../core/chat-types/types";

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
export function formatForgeChip(a: ForgeActionRecord): { icon: string; label: string } {
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
      const type = ELEMENT_LABEL[a.elementType ?? ""] ?? a.elementType ?? "Entity";
      return { icon: "➕", label: `${type} · ${a.name ?? ""}` };
    }
    case "REVISE":
      return { icon: "✏️", label: `Revised · ${a.name ?? ""}` };
    case "DELETE":
      return { icon: "🗑", label: `Deleted · ${a.name ?? ""}` };
    case "RENAME":
      return { icon: "✏️", label: `Renamed · ${a.name ?? ""} → ${a.newName ?? ""}` };
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
        text({ id: `${idPrefix}-seg-${i}-label`, text: label, style: { flex: "1" } }),
      ],
    });
  });
}
