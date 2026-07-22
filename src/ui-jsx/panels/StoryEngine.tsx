// Story Engine tab body. Swaps between the Foundation + World stack, the
// entity/thread edit pane (ui.activeEditId singleton), and the Import wizard
// (local importOpen state, header button) — in that priority order, so an
// open edit pane always wins over the wizard. add-entity, add-thread, and a
// card name-click set activeEditId; the pane's Back/Save/Delete clear it.
// Routed by membership: entitiesById for entities, world.groups for threads.

import { useSlice } from "../bridge";
import { SP } from "../style";
import { Header } from "./header/Header";
import { Foundation } from "./foundation/Foundation";
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
  const [importOpen, setImportOpen] = useState(false);

  if (editId && isEntity) {
    return <EntityEditPane entityId={editId} />;
  }
  if (editId && isThread) {
    return <ThreadEditPane groupId={editId} />;
  }
  if (importOpen) {
    return <ImportWizard onClose={() => setImportOpen(false)} />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SP.md }}>
      <Header onOpenImport={() => setImportOpen(true)} />
      <Foundation />
      <ForgeSection />
      <World />
    </div>
  );
}
