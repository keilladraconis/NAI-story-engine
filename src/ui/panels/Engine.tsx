// Engine tab body: the World and the Forge, plus the entity and thread edit
// panes. Swaps between the Forge + World stack and whichever pane the shared
// ui.activeEditId singleton names — routed by membership over entitiesById and
// world.threads. Foundation field ids belong to the Setup tab (Setup.tsx), which
// also owns the Import wizard.
//
// The header lives above this tree, rendered by App alongside the tab bar.

import { useSlice } from "../bridge";
import { SP } from "../style";
import { ForgeSection } from "./forge/ForgeSection";
import { World } from "./world/World";
import { EntityEditPane } from "./world/EntityEditPane";
import { ThreadEditPane } from "./world/ThreadEditPane";

export function Engine() {
  const editId = useSlice((s) => s.ui.activeEditId);
  const isEntity = useSlice((s) =>
    editId ? !!s.world.entitiesById[editId] : false,
  );
  const isThread = useSlice((s) =>
    editId ? s.world.threads.some((t) => t.id === editId) : false,
  );

  if (editId && isEntity) {
    return <EntityEditPane entityId={editId} />;
  }
  if (editId && isThread) {
    return <ThreadEditPane threadId={editId} />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SP.md }}>
      <ForgeSection />
      <World />
    </div>
  );
}
