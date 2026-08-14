// Import wizard shell — a full-view takeover of the Setup tab. Header
// (Back / title / Refresh / Import All) over the foundation + lorebook sections.
// Import All batches ATTG+Style+bind-all-unmanaged+Shape+Intent, then closes.

import { T, SP } from "../../style";
import {
  store,
  attgUpdated,
  attgSyncSet,
  styleUpdated,
  styleSyncSet,
  shapeGenerationRequested,
  intentGenerationRequested,
  contractGenerationRequested,
  entitiesBoundBatch,
} from "../../../core/store";
import type { DulfsFieldID } from "../../../config/field-definitions";
import {
  useImportData,
  unmanagedEntries,
  resolveImportCategory,
} from "./import-data";
import { ImportFoundation } from "./ImportFoundation";
import { ImportLorebook } from "./ImportLorebook";
import { useTapGuard } from "../../tap-guard";
import { ArrowLeft, RefreshCw, Download } from "nai:icons/feather";

const sectionLabel = {
  fontSize: "0.7em",
  fontWeight: "bold",
  opacity: 0.5,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  margin: "10px 0 4px",
} as const;
const iconBtn = {
  background: "none",
  border: "none",
  cursor: "pointer",
  color: T.text,
  display: "flex",
  alignItems: "center",
  padding: "2px",
} as const;

export function ImportWizard(props: { onClose: () => void }) {
  const data = useImportData();
  const onceBackTap = useTapGuard();
  const onceRefreshTap = useTapGuard();
  const onceImportAllTap = useTapGuard();
  // Per-entry category overrides, owned here so the ImportLorebook rows and the
  // "Import All" batch bind resolve categories identically.
  const [dulfsMap, setDulfsMap] = useState<Record<string, DulfsFieldID>>({});
  const onCycle = (entryId: string, next: DulfsFieldID) =>
    setDulfsMap((m) => ({ ...m, [entryId]: next }));

  const onImportAll = () => {
    if (data.memText.trim()) {
      store.dispatch(attgUpdated({ attg: data.memText }));
      store.dispatch(attgSyncSet({ enabled: true }));
      void api.v1.memory.set(data.memText);
    }
    if (data.anText.trim()) {
      store.dispatch(styleUpdated({ style: data.anText }));
      store.dispatch(styleSyncSet({ enabled: true }));
    }
    // Bind every currently-unmanaged entry (fresh managed set from the store).
    // `data.entries` is the last-loaded lorebook snapshot — Refresh to re-read
    // if entries were added since the wizard opened.
    const managed = new Set(
      Object.values(store.getState().world.entitiesById)
        .map((e) => e.lorebookEntryId)
        .filter((id): id is string => !!id),
    );
    const unmanaged = unmanagedEntries(data.entries, managed);
    if (unmanaged.length > 0) {
      store.dispatch(
        entitiesBoundBatch(
          unmanaged.map((entry) => ({
            id: api.v1.uuid(),
            categoryId: resolveImportCategory(entry, dulfsMap),
            lorebookEntryId: entry.id,
            name: entry.displayName || "Unknown",
            summary: "",
            lifecycle: "live" as const,
          })),
        ),
      );
    }
    store.dispatch(shapeGenerationRequested());
    store.dispatch(intentGenerationRequested());
    // Last of the three: message factories resolve when the queued task runs, so
    // the contract reads the Shape and Intent the two above have committed by
    // then rather than the empty anchors they started from.
    store.dispatch(contractGenerationRequested());
    props.onClose();
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: SP.xs,
        paddingBottom: "32px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: SP.sm }}>
        <button
          title="Back"
          onClick={() => onceBackTap(props.onClose)}
          style={iconBtn}
        >
          <ArrowLeft size={16} />
        </button>
        <span style={{ flex: 1, fontWeight: "bold", color: T.textHeadings }}>
          Import Existing Content
        </span>
        <button
          title="Refresh lorebook"
          onClick={() =>
            onceRefreshTap(() => {
              data.refresh();
              void api.v1.ui.toast("Lorebook refreshed", { type: "info" });
            })
          }
          style={iconBtn}
        >
          <RefreshCw size={16} />
        </button>
        <button
          onClick={() => onceImportAllTap(onImportAll)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: SP.xs,
            padding: "4px 10px",
            background: T.bg2,
            border: "none",
            cursor: "pointer",
            color: T.textHeadings,
            fontSize: "0.85em",
          }}
        >
          <Download size={14} /> Import All
        </button>
      </div>

      <span style={sectionLabel}>Foundation Fields</span>
      <ImportFoundation memText={data.memText} anText={data.anText} />

      <span style={sectionLabel}>Lorebook Entries</span>
      <ImportLorebook
        entries={data.entries}
        categoryNames={data.categoryNames}
        dulfsMap={dulfsMap}
        onCycle={onCycle}
      />
    </div>
  );
}
