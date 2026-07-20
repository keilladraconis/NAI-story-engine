// Story Engine tab body. Swaps between the Foundation + World stack and the
// entity edit pane based on the ui.activeEditId singleton. add-entity and a card
// name-click set activeEditId; the pane's Back/Save/Delete clear it. Guarded by
// entitiesById membership so only entity edits route here (threads come later).

import { useSlice } from "../bridge";
import { SP } from "../style";
import { Foundation } from "./foundation/Foundation";
import { World } from "./world/World";
import { EntityEditPane } from "./world/EntityEditPane";

export function StoryEngine() {
  const editId = useSlice((s) => s.ui.activeEditId);
  const isEntity = useSlice((s) =>
    editId ? !!s.world.entitiesById[editId] : false,
  );

  if (editId && isEntity) {
    return <EntityEditPane entityId={editId} />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SP.md }}>
      <Foundation />
      <World />
    </div>
  );
}
