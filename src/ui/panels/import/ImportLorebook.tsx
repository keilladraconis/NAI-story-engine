// Lorebook-binding section of the JSX Import wizard: unmanaged lorebook entries
// grouped by category, each with a DULFS category picker (override state lives in
// ImportWizard so "Import All" honors it) and a Bind button. `unmanaged` is
// reactive — binding an entry changes world.entitiesById, so the managedKey
// selector drops the row.

import { useSlice } from "../../bridge";
import { T, SP } from "../../style";
import { store, entityBound } from "../../../core/store";
import { cycleDulfsCategory } from "../../../core/utils/category-detect";
import type { DulfsFieldID } from "../../../config/field-definitions";
import {
  DULFS_SHORT,
  groupAndSortEntries,
  unmanagedEntries,
  resolveImportCategory,
  type LorebookEntry,
} from "./import-data";

const groupHeader = {
  fontSize: "0.7em",
  fontWeight: "bold",
  opacity: 0.5,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  margin: "10px 0 2px",
} as const;
const entryRow = {
  display: "flex",
  alignItems: "center",
  gap: SP.sm,
  padding: "4px 0",
  borderBottom: "1px solid rgba(255,255,255,0.04)",
} as const;
const entryName = {
  flex: 1,
  minWidth: 0, // let the flex item shrink below content width so the buttons stay on-screen
  fontSize: "0.85em",
  overflow: "hidden",
  whiteSpace: "nowrap",
  textOverflow: "ellipsis",
} as const;
const smallBtn = {
  flexShrink: 0,
  fontSize: "0.72em",
  padding: "2px 7px",
  background: T.bg2,
  color: T.text,
  border: "none",
  cursor: "pointer",
} as const;

export function ImportLorebook(props: {
  entries: LorebookEntry[];
  categoryNames: Map<string, string>;
  // Per-entry category overrides live in ImportWizard so "Import All" honors the
  // same choices these rows show. onCycle advances one entry's override.
  dulfsMap: Record<string, DulfsFieldID>;
  onCycle: (entryId: string, next: DulfsFieldID) => void;
}) {
  // Primitive: the sorted, joined set of bound lorebookEntryIds. Changes on Bind.
  const managedKey = useSlice((s) =>
    Object.values(s.world.entitiesById)
      .map((e) => e.lorebookEntryId)
      .filter((id): id is string => !!id)
      .sort()
      .join(","),
  );

  const managed = new Set(managedKey ? managedKey.split(",") : []);
  const unmanaged = unmanagedEntries(props.entries, managed);

  if (unmanaged.length === 0) {
    return (
      <div style={{ opacity: 0.5, fontSize: "0.85em", padding: "8px 0" }}>
        {props.entries.length === 0
          ? "No lorebook entries found. Refresh after adding entries."
          : "All lorebook entries are already bound to Story Engine entities."}
      </div>
    );
  }

  const catFor = (e: LorebookEntry): DulfsFieldID =>
    resolveImportCategory(e, props.dulfsMap);

  const groups = groupAndSortEntries(unmanaged, props.categoryNames);

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {groups.map((g) => (
        <div key={g.key} style={{ display: "flex", flexDirection: "column" }}>
          <span style={groupHeader}>{g.label}</span>
          {g.entries.map((entry) => {
            const cat = catFor(entry);
            return (
              <div key={entry.id} style={entryRow}>
                <span style={entryName}>
                  {entry.displayName || "(unnamed)"}
                </span>
                <button
                  style={{ ...smallBtn, opacity: 0.7 }}
                  title="Cycle category"
                  onClick={() =>
                    props.onCycle(entry.id, cycleDulfsCategory(cat))
                  }
                >
                  {DULFS_SHORT[cat]} ▶
                </button>
                <button
                  style={smallBtn}
                  onClick={() => {
                    store.dispatch(
                      entityBound({
                        entity: {
                          id: api.v1.uuid(),
                          categoryId: cat,
                          lorebookEntryId: entry.id,
                          name: entry.displayName || "Unknown",
                          summary: "",
                          lifecycle: "live",
                        },
                      }),
                    );
                    void api.v1.ui.toast(
                      `Bound: ${entry.displayName || "entry"}`,
                      { type: "success" },
                    );
                  }}
                >
                  ⚡ Bind
                </button>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
