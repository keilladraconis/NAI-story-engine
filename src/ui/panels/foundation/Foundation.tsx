// Narrative Foundation list: the Intensity picker then one FieldCard per
// descriptor. Editing is not handled here — a card's Edit button sets the
// shared ui.activeEditId singleton and the Setup tab swaps its whole body to
// FoundationEditPane, the same way entity and thread panes take over in Engine.

import { SP } from "../../style";
import { IntensityPicker } from "./IntensityPicker";
import { FieldCard } from "./FieldCard";
import { FIELD_DESCRIPTORS } from "./fields";

export function Foundation() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SP.md }}>
      <IntensityPicker />
      {FIELD_DESCRIPTORS.map((d) => (
        <FieldCard key={d.id} descriptor={d} />
      ))}
    </div>
  );
}
