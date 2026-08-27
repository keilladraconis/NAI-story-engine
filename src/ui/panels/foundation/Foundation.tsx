// The Foundation field cards — one FieldCard per descriptor.
//
// Intensity is NOT rendered here. It sits above these cards, but the brainstorm
// CTA sits between the two, so the Setup tab composes picker → CTA → cards
// itself rather than this component owning a slot it cannot order.
//
// Editing is not handled here either: a card's Edit button sets the shared
// ui.activeEditId singleton and Setup swaps the whole tab to FoundationEditPane,
// the same way entity and thread panes take over the Engine tab.

import { SP } from "../../style";
import { FieldCard } from "./FieldCard";
import { FIELD_DESCRIPTORS } from "./fields";

export function Foundation() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SP.md }}>
      {FIELD_DESCRIPTORS.map((d) => (
        <FieldCard key={d.id} descriptor={d} />
      ))}
    </div>
  );
}
