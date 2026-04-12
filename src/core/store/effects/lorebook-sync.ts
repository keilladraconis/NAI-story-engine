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

/**
 * Migrate old lorebook category names to new names.
 * Safe to call multiple times — skips already-renamed categories.
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
}

// Helper: Find or create a category for a field
export async function ensureCategory(fieldId: DulfsFieldID): Promise<string> {
  const config = FIELD_CONFIGS.find((c) => c.id === fieldId);
  const name = `${SE_CATEGORY_PREFIX}${config?.label || fieldId}`;

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
  const config = FIELD_CONFIGS.find((c) => c.id === fieldId);
  const name = `${SE_CATEGORY_PREFIX}${config?.label || fieldId}`;
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

  // Update categories
  for (const categoryId of categoryIds) {
    if (erato) {
      await api.v1.lorebook.updateCategory(categoryId, {
        settings: { entryHeader: "" },
      });
    } else {
      await api.v1.lorebook.updateCategory(categoryId, {
        settings: { entryHeader: "----" },
      });
    }
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

  // Re-sync ATTG → Memory, Style → A/N if enabled
  const { attg, style, attgSyncEnabled, styleSyncEnabled } = getState().foundation;
  if (attgSyncEnabled && attg.trim()) await api.v1.memory.set(attg.trim());
  if (styleSyncEnabled && style.trim()) await api.v1.an.set(style.trim());
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
  // Lorebook sync for world entities is handled directly by the list handler
  // and forge handler at creation time. No subscribeEffect needed.
}
