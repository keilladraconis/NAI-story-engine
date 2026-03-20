import { Store, matchesAction } from "nai-store";
import { RootState, AppDispatch } from "../types";
import {
  dulfsItemAdded,
  dulfsItemRemoved,
  storyCleared,
  queueCleared,
  entitySummaryUpdated,
  foundationCleared,
  worldCleared,
} from "../index";
import { DulfsFieldID, FieldID, FIELD_CONFIGS } from "../../../config/field-definitions";
import { STORAGE_KEYS, IDS } from "../../../ui/framework/ids";
import { extractDulfsItemName } from "../../utils/context-builder";
import { attgForMemory } from "../../utils/filters";

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
      api.v1.log(`[lorebook] Renamed category "${category.name}" → "${newName}"`);
    }
  }
}

// Helper: Find or create a category for a DULFS field
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

// Helper: Find a category for a DULFS field (returns null if not found)
export async function findCategory(fieldId: DulfsFieldID): Promise<string | null> {
  const config = FIELD_CONFIGS.find((c) => c.id === fieldId);
  const name = `${SE_CATEGORY_PREFIX}${config?.label || fieldId}`;
  const categories = await api.v1.lorebook.categories();
  return categories.find((c) => c.name === name)?.id || null;
}

/**
 * Sync lorebook entries and categories when erato_compatibility is toggled.
 * - Erato ON: clear entryHeader from categories, prepend "----\n" to entry text
 * - Erato OFF: set entryHeader on categories, strip "----\n" from entry text
 */
export async function syncEratoCompatibility(
  getState: () => RootState,
): Promise<void> {
  const erato = (await api.v1.config.get("erato_compatibility")) || false;
  const dulfs = getState().story.dulfs;

  // Collect managed entry IDs from DULFS state
  const entryIds: string[] = [];
  for (const fieldId in dulfs) {
    const items = dulfs[fieldId as DulfsFieldID];
    if (items) {
      for (const item of items) {
        entryIds.push(item.id);
      }
    }
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
      await api.v1.lorebook.updateCategory(categoryId, { settings: { entryHeader: "" } });
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

  // Re-sync ATTG → Memory through attgForMemory (adds/removes [ S:4 ] as needed)
  const attgSyncEnabled = await api.v1.storyStorage.get(STORAGE_KEYS.SYNC_ATTG_MEMORY);
  if (attgSyncEnabled) {
    const attgContent = String((await api.v1.storyStorage.get(STORAGE_KEYS.field(FieldID.ATTG))) || "");
    if (attgContent) {
      await api.v1.memory.set(await attgForMemory(attgContent));
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 7: Lorebook Sync — summary reconciliation
// ─────────────────────────────────────────────────────────────────────────────

/** Extract a short display summary from lorebook entry text. Skips the header block. */
function extractEntitySummary(entryText: string): string {
  const HEADER_PREFIXES = ["Name:", "Type:", "Setting:", "----", "***"];
  const lines = entryText.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (HEADER_PREFIXES.some((p) => trimmed.startsWith(p))) continue;
    return trimmed.length > 120 ? trimmed.slice(0, 117) + "..." : trimmed;
  }
  return "";
}

/**
 * Reconcile WorldEntity summaries against current lorebook entry content.
 * Called from onBeforeContextBuild (full pass) and onLorebookEntrySelected (single entry).
 */
export async function reconcileEntitySummaries(
  dispatch: AppDispatch,
  getState: () => RootState,
  singleEntryId?: string,
): Promise<void> {
  const state = getState();
  const liveEntities = state.world.entities.filter(
    (e) => e.lifecycle === "live" && e.lorebookEntryId,
  );

  if (liveEntities.length === 0) return;

  const allEntries = singleEntryId ? null : await api.v1.lorebook.entries();

  for (const entity of liveEntities) {
    if (singleEntryId && entity.lorebookEntryId !== singleEntryId) continue;

    const entry = singleEntryId
      ? await api.v1.lorebook.entry(singleEntryId)
      : allEntries!.find((e) => e.id === entity.lorebookEntryId);

    if (!entry?.text) continue;

    const newSummary = extractEntitySummary(entry.text);
    if (newSummary !== entity.summary) {
      dispatch(entitySummaryUpdated({ entityId: entity.id, summary: newSummary }));
    }
  }
}

/**
 * Register NovelAI API hooks for lorebook sync (Phase 7).
 * Call from index.ts after store is ready.
 */
export function registerLorebookSyncHooks(
  dispatch: AppDispatch,
  getState: () => RootState,
): void {
  // 7.1 — Reconcile summaries before every context build
  api.v1.hooks.register("onBeforeContextBuild", async () => {
    await reconcileEntitySummaries(dispatch, getState);
  });
}

export function registerLorebookSyncEffects(
  subscribeEffect: Store<RootState>["subscribeEffect"],
  _dispatch: AppDispatch,
  _getState: () => RootState,
): void {
  // Lorebook Sync: Item Added
  subscribeEffect(
    matchesAction(dulfsItemAdded),
    async (action) => {
      const { fieldId, item } = action.payload;
      const content =
        (await api.v1.storyStorage.get(STORAGE_KEYS.dulfsItem(item.id))) || "";

      const name = extractDulfsItemName(String(content), fieldId);

      const categoryId = await ensureCategory(fieldId);
      await api.v1.lorebook.createEntry({
        id: item.id,
        category: categoryId,
        displayName: name,
        keys: [],
        enabled: true,
      });
    },
  );

  // Lorebook Sync: Item Removed
  subscribeEffect(matchesAction(dulfsItemRemoved), async (action) => {
    const { fieldId, itemId } = action.payload;

    await api.v1.lorebook.removeEntry(itemId);
    await api.v1.storyStorage.set(STORAGE_KEYS.dulfsItem(itemId), null);

    const categoryId = await findCategory(fieldId);
    if (categoryId) {
      const entries = await api.v1.lorebook.entries(categoryId);
      if (entries.length === 0) {
        await api.v1.lorebook.removeCategory(categoryId);
      }
    }
  });

  // Lorebook Sync & Storage Cleanup: Story Cleared
  subscribeEffect(
    (action) => action.type === storyCleared.type,
    async (_action, { dispatch }) => {
      const categories = await api.v1.lorebook.categories();
      const seCategories = categories.filter((c) =>
        c.name?.startsWith(SE_CATEGORY_PREFIX),
      );

      for (const category of seCategories) {
        const entries = await api.v1.lorebook.entries(category.id);
        for (const entry of entries) {
          await api.v1.lorebook.removeEntry(entry.id);
        }
        await api.v1.lorebook.removeCategory(category.id);
      }

      const allEntries = await api.v1.lorebook.entries();
      const marker = allEntries.find(
        (e) => e.displayName === SE_ERATO_MARKER_NAME,
      );
      if (marker) {
        await api.v1.lorebook.removeEntry(marker.id);
      }

      const allKeys = await api.v1.storyStorage.list();
      const patternsToRemove = [
        /^kse-field-/,
        /^kse-sync-/,
        /^kse-section-/,
        /^draft-/,
        /^dulfs-item-/,
        /^se-bs-input$/,
        /^cr-/,
        /^lb-/,
        /^story:se-fn-/,
        /^story:se-forge-/,
        /^story:se-world-/,
      ];

      for (const key of allKeys) {
        if (patternsToRemove.some((pattern) => pattern.test(key))) {
          await api.v1.storyStorage.remove(key);
        }
      }

      dispatch(foundationCleared());
      dispatch(worldCleared());
      dispatch(queueCleared());

      // Reset foundation textarea UI inputs (bound via storageKey, won't react to state alone)
      api.v1.ui.updateParts([
        { id: IDS.FOUNDATION.ATTG_INPUT, value: "" },
        { id: IDS.FOUNDATION.STYLE_INPUT, value: "" },
      ]);
    },
  );
}
