// Story Engine tab body. Swaps between the Foundation + World stack, the
// foundation-field/entity/thread edit pane (ui.activeEditId singleton), and the
// Import wizard (ui.importWizardOpen) — in that priority order, so an open edit
// pane always wins over the wizard. A Foundation card's Edit button,
// add-entity, add-thread, and a card name-click set activeEditId; the pane's
// Back/Save/Delete clear it. Every pane replaces the whole tab — Foundation,
// Forge and World are all gone while one is open. Routed by membership:
// FIELD_DESCRIPTORS for foundation fields, entitiesById for entities,
// world.groups for threads.
// The header lives above this tree as a UIPart (see ../mount.ts,
// ../header/header-driver.ts) — it is not part of this component.

import { useSlice } from "../bridge";
import { store, importWizardClosed } from "../../core/store";
import { SP } from "../style";
import { Foundation } from "./foundation/Foundation";
import { FoundationEditPane } from "./foundation/FoundationEditPane";
import { FIELD_DESCRIPTORS } from "./foundation/fields";
import { ForgeSection } from "./forge/ForgeSection";
import { World } from "./world/World";
import { EntityEditPane } from "./world/EntityEditPane";
import { ThreadEditPane } from "./world/ThreadEditPane";
import { ImportWizard } from "./import/ImportWizard";

export function StoryEngine() {
  const editId = useSlice((s) => s.ui.activeEditId);
  const isEntity = useSlice((s) =>
    editId ? !!s.world.entitiesById[editId] : false,
  );
  const isThread = useSlice((s) =>
    editId ? s.world.groups.some((g) => g.id === editId) : false,
  );
  const importOpen = useSlice((s) => s.ui.importWizardOpen);
  const field = editId
    ? FIELD_DESCRIPTORS.find((d) => d.id === editId)
    : undefined;

  if (field) {
    return <FoundationEditPane descriptor={field} />;
  }
  if (editId && isEntity) {
    return <EntityEditPane entityId={editId} />;
  }
  if (editId && isThread) {
    return <ThreadEditPane groupId={editId} />;
  }
  if (importOpen) {
    return (
      <ImportWizard onClose={() => store.dispatch(importWizardClosed())} />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SP.md }}>
      <Foundation />
      <ForgeSection />
      <World />
    </div>
  );
}
