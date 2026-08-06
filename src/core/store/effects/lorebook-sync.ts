import { Store } from "nai-store";
import { RootState, AppDispatch } from "../types";
import { DulfsFieldID, FIELD_CONFIGS } from "../../../config/field-definitions";

// Lorebook sync constants
export const SE_CATEGORY_PREFIX = "SE: ";
export const SE_ERATO_MARKER_NAME = "SE: End of Lorebook";

// Legacy category names → new names (for migration)
const CATEGORY_RENAME_MAP: Record<string, string> = {
  "SE: Dramatis Personae": "SE: Characters",
  "SE: Universe Systems": "SE: Systems",
  "SE: Situational Dynamics": "SE: Narrative Vectors",
};

/** The "SE: <Label>" lorebook category name a Story Engine category maps to. */
function categoryNameFor(fieldId: DulfsFieldID): string {
  const config = FIELD_CONFIGS.find((c) => c.id === fieldId);
  return `${SE_CATEGORY_PREFIX}${config?.label || fieldId}`;
}

/**
 * Migrate old lorebook category names to new names, then merge any duplicate
 * "SE: " categories left behind by older builds.
 * Safe to call multiple times — skips already-renamed, already-unique categories.
 */
export async function migrateLorebookCategories(): Promise<void> {
  const categories = await api.v1.lorebook.categories();
  for (const category of categories) {
    const newName = category.name && CATEGORY_RENAME_MAP[category.name];
    if (newName) {
      await api.v1.lorebook.updateCategory(category.id, { name: newName });
      api.v1.log(
        `[lorebook] Renamed category "${category.name}" → "${newName}"`,
      );
    }
  }
  await mergeDuplicateCategories();
}

/**
 * Collapse duplicate "SE: " categories into one.
 *
 * Cast All used to race itself into creating a fresh category per draft (see
 * `ensureCategory`), so existing stories carry the leftovers. The first
 * category with a given name wins — every entry filed under a duplicate moves
 * to it, then the emptied duplicate is removed. Only "SE: " categories are
 * touched; the user's own categories are never merged, even if same-named.
 */
async function mergeDuplicateCategories(): Promise<void> {
  const categories = await api.v1.lorebook.categories();
  const canonicalByName = new Map<string, string>();
  const duplicates: { id: string; name: string; canonicalId: string }[] = [];

  for (const category of categories) {
    const name = category.name;
    if (!name?.startsWith(SE_CATEGORY_PREFIX)) continue;
    const canonicalId = canonicalByName.get(name);
    if (canonicalId) {
      duplicates.push({ id: category.id, name, canonicalId });
    } else {
      canonicalByName.set(name, category.id);
    }
  }
  if (duplicates.length === 0) return;

  const allEntries = await api.v1.lorebook.entries();
  for (const duplicate of duplicates) {
    for (const entry of allEntries) {
      if (entry.category !== duplicate.id) continue;
      await api.v1.lorebook.updateEntry(entry.id, {
        category: duplicate.canonicalId,
      });
    }
    await api.v1.lorebook.removeCategory(duplicate.id);
    api.v1.log(`[lorebook] Merged duplicate category "${duplicate.name}"`);
  }
}

/**
 * In-flight `ensureCategory` calls, keyed by category name.
 *
 * `ensureCategory` looks the category up and creates it only if missing, but
 * there is an `await` between the two — and its callers run concurrently
 * (store effects are fire-and-forget, and Cast All dispatches one per draft).
 * Without this, every draft in a category would look first, all miss, and all
 * create their own copy. Sharing the pending promise collapses a burst into a
 * single find-or-create. The entry is dropped once it settles, so later calls
 * re-read the lorebook instead of trusting a cached id the user may have since
 * deleted.
 */
const inFlightCategories = new Map<string, Promise<string>>();

// Helper: Find or create a category for a field
export async function ensureCategory(fieldId: DulfsFieldID): Promise<string> {
  const name = categoryNameFor(fieldId);
  const pending = inFlightCategories.get(name);
  if (pending) return pending;

  const work = findOrCreateCategory(name);
  inFlightCategories.set(name, work);
  try {
    return await work;
  } finally {
    inFlightCategories.delete(name);
  }
}

async function findOrCreateCategory(name: string): Promise<string> {
  const categories = await api.v1.lorebook.categories();
  const existing = categories.find((c) => c.name === name);
  if (existing) return existing.id;

  const erato = (await api.v1.config.get("erato_compatibility")) || false;

  return api.v1.lorebook.createCategory({
    id: api.v1.uuid(),
    name,
    enabled: true,
    settings: erato ? {} : { entryHeader: "----" },
  });
}

// Helper: Find a category for a field (returns null if not found)
export async function findCategory(
  fieldId: DulfsFieldID,
): Promise<string | null> {
  const name = categoryNameFor(fieldId);
  const categories = await api.v1.lorebook.categories();
  return categories.find((c) => c.name === name)?.id || null;
}

/**
 * Sync lorebook entries and categories when erato_compatibility is toggled.
 * Reads managed entry IDs from WorldEntities (via lorebookEntryId).
 */
export async function syncEratoCompatibility(
  getState: () => RootState,
): Promise<void> {
  const erato = (await api.v1.config.get("erato_compatibility")) || false;

  // Collect managed entry IDs from WorldEntities
  const entryIds: string[] = [];
  for (const entity of Object.values(getState().world.entitiesById)) {
    if (entity.lorebookEntryId) entryIds.push(entity.lorebookEntryId);
  }

  // Gather unique category IDs from managed entries
  const categoryIds = new Set<string>();
  for (const entryId of entryIds) {
    const entry = await api.v1.lorebook.entry(entryId);
    if (entry?.category) {
      categoryIds.add(entry.category);
    }
  }

  // Update categories (skip when already at the desired value to avoid
  // bumping the story's modifiedAt on every plugin load).
  const desiredHeader = erato ? "" : "----";
  for (const categoryId of categoryIds) {
    const category = await api.v1.lorebook.category(categoryId);
    if (category?.settings?.entryHeader === desiredHeader) continue;
    await api.v1.lorebook.updateCategory(categoryId, {
      settings: { entryHeader: desiredHeader },
    });
  }

  // Update entry text
  for (const entryId of entryIds) {
    const entry = await api.v1.lorebook.entry(entryId);
    if (!entry?.text) continue;

    const ERATO_SEPARATOR = "----\n";
    if (erato && !entry.text.startsWith(ERATO_SEPARATOR)) {
      await api.v1.lorebook.updateEntry(entryId, {
        text: ERATO_SEPARATOR + entry.text,
      });
    } else if (!erato && entry.text.startsWith(ERATO_SEPARATOR)) {
      await api.v1.lorebook.updateEntry(entryId, {
        text: entry.text.slice(ERATO_SEPARATOR.length),
      });
    }
  }

  // Manage "End of Lorebook" marker entry
  const allEntries = await api.v1.lorebook.entries();
  const existingMarker = allEntries.find(
    (e) => e.displayName === SE_ERATO_MARKER_NAME,
  );

  if (erato && !existingMarker) {
    await api.v1.lorebook.createEntry({
      id: api.v1.uuid(),
      displayName: SE_ERATO_MARKER_NAME,
      text: "***\n",
      keys: [],
      enabled: true,
      forceActivation: true,
    });
    api.v1.ui.toast(
      'Created "SE: End of Lorebook" entry. Set its insertion order to 1.',
      { type: "info" },
    );
  } else if (!erato && existingMarker) {
    await api.v1.lorebook.removeEntry(existingMarker.id);
  }

  // Re-sync ATTG → Memory, Style → A/N if enabled. Skip when the current
  // value already matches to avoid bumping the story's modifiedAt on load.
  const { attg, style, attgSyncEnabled, styleSyncEnabled } =
    getState().foundation;
  if (attgSyncEnabled) {
    const trimmed = attg.trim();
    if (trimmed) {
      const current = await api.v1.memory.get();
      if (current !== trimmed) await api.v1.memory.set(trimmed);
    }
  }
  if (styleSyncEnabled) {
    const trimmed = style.trim();
    if (trimmed) {
      const current = await api.v1.an.get();
      if (current !== trimmed) await api.v1.an.set(trimmed);
    }
  }
}

/**
 * Register NovelAI API hooks for lorebook sync.
 * Call from index.ts after store is ready.
 */
export function registerLorebookSyncHooks(
  _dispatch: AppDispatch,
  _getState: () => RootState,
): void {
  // No hooks currently registered.
  // Entity summaries are owned exclusively by Story Engine and are never
  // read back from or written to lorebook entry text.
}

export function registerLorebookSyncEffects(
  _subscribeEffect: Store<RootState>["subscribeEffect"],
  _dispatch: AppDispatch,
  _getState: () => RootState,
): void {
  // Entity categorization is a Story Engine concept — `entity.categoryId`
  // drives template selection and organization inside the sidebar — and is
  // intentionally independent of where the lorebook entry lives in the
  // user's lorebook. Users may reorganize imported or long-running entries
  // however they want; we don't shuffle them around when the SE category
  // changes. The lorebook category is only assigned at creation time
  // (`SeEntityEditPane` on save, cast/forge effects at bind time).
}
