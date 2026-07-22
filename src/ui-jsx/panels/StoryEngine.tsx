// Story Engine tab body. Swaps between the Foundation + World stack and the
// entity/thread edit pane based on the ui.activeEditId singleton. add-entity,
// add-thread, and a card name-click set activeEditId; the pane's Back/Save/
// Delete clear it. Routed by membership: entitiesById for entities, world.groups
// for threads.

import { useSlice } from "../bridge";
import { SP } from "../style";
import { Foundation } from "./foundation/Foundation";
import { ForgeSection } from "./forge/ForgeSection";
import { World } from "./world/World";
import { EntityEditPane } from "./world/EntityEditPane";
import { ThreadEditPane } from "./world/ThreadEditPane";

export function StoryEngine() {
  const editId = useSlice((s) => s.ui.activeEditId);
  const isEntity = useSlice((s) =>
    editId ? !!s.world.entitiesById[editId] : false,
  );
  const isThread = useSlice((s) =>
    editId ? s.world.groups.some((g) => g.id === editId) : false,
  );

  if (editId && isEntity) {
    return <EntityEditPane entityId={editId} />;
  }
  if (editId && isThread) {
    return <ThreadEditPane groupId={editId} />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SP.md }}>
      <Foundation />
      <ForgeSection />
      <World />
    </div>
  );
}
