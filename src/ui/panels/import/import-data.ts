// Data layer for the JSX Import wizard: pure grouping/filtering helpers (unit-
// tested) + a loader hook that reads memory, A/N, and the lorebook. NAI runtime
// globals (useState/useEffect) are available in .ts files (see hooks.ts).

import { FieldID, type DulfsFieldID } from "../../../config/field-definitions";

export type LorebookEntry = {
  id: string;
  displayName?: string;
  category?: string;
  text?: string;
};

export const DULFS_SHORT: Record<DulfsFieldID, string> = {
  [FieldID.DramatisPersonae]: "Char",
  [FieldID.UniverseSystems]: "Sys",
  [FieldID.Locations]: "Loc",
  [FieldID.Factions]: "Fac",
  [FieldID.SituationalDynamics]: "Dyn",
  [FieldID.Topics]: "Topic",
};

/** Lorebook entries not bound to any Story Engine entity. */
export function unmanagedEntries(
  entries: LorebookEntry[],
  managedIds: Set<string>,
): LorebookEntry[] {
  return entries.filter((e) => !managedIds.has(e.id));
}

/** Group entries by lorebook category — named categories alphabetical by display
 *  name, "uncategorized" (missing category) last. Label falls back to the key. */
export function groupAndSortEntries(
  entries: LorebookEntry[],
  categoryNames: Map<string, string>,
): { key: string; label: string; entries: LorebookEntry[] }[] {
  const groups = new Map<string, LorebookEntry[]>();
  for (const entry of entries) {
    const key = entry.category ?? "uncategorized";
    const list = groups.get(key) ?? [];
    list.push(entry);
    groups.set(key, list);
  }
  const keys = [...groups.keys()].sort((a, b) => {
    if (a === "uncategorized") return 1;
    if (b === "uncategorized") return -1;
    return (categoryNames.get(a) ?? a).localeCompare(categoryNames.get(b) ?? b);
  });
  return keys.map((key) => ({
    key,
    label:
      key === "uncategorized"
        ? "Uncategorized"
        : (categoryNames.get(key) ?? key),
    entries: groups.get(key)!,
  }));
}

/** Loads memory / A-N / lorebook entries + categories on mount; `refresh`
 *  reloads the lorebook. All async reads are cancelled-guarded. */
export function useImportData(): {
  memText: string;
  anText: string;
  entries: LorebookEntry[];
  categoryNames: Map<string, string>;
  refresh: () => void;
} {
  const [memText, setMemText] = useState("");
  const [anText, setAnText] = useState("");
  const [entries, setEntries] = useState<LorebookEntry[]>([]);
  const [categoryNames, setCategoryNames] = useState<Map<string, string>>(
    new Map(),
  );
  const [epoch, setEpoch] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [mem, an, es, cats] = await Promise.all([
        api.v1.memory.get(),
        api.v1.an.get(),
        api.v1.lorebook.entries(),
        api.v1.lorebook.categories(),
      ]);
      if (cancelled) return;
      setMemText(mem);
      setAnText(an);
      setEntries(es as LorebookEntry[]);
      setCategoryNames(new Map(cats.map((c) => [c.id, c.name ?? c.id])));
    })();
    return () => {
      cancelled = true;
    };
  }, [epoch]);

  return {
    memText,
    anText,
    entries,
    categoryNames,
    refresh: () => setEpoch((n) => n + 1),
  };
}
