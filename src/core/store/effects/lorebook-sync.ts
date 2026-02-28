import { Store, matchesAction } from "nai-store";
import { RootState, AppDispatch } from "../types";
import {
  dulfsItemAdded,
  dulfsItemRemoved,
  storyCleared,
  queueCleared,
} from "../index";
import { DulfsFieldID, FIELD_CONFIGS } from "../../../config/field-definitions";
import { extractDulfsItemName } from "../../utils/context-builder";
import { attgForMemory } from "../../utils/filters";

// Lorebook sync constants
export const SE_CATEGORY_PREFIX = "SE: ";
export const SE_ERATO_MARKER_NAME = "SE: End of Lorebook";

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

    if (erato && !entry.text.startsWith("----\n")) {
      await api.v1.lorebook.updateEntry(entryId, {
        text: "----\n" + entry.text,
      });
    } else if (!erato && entry.text.startsWith("----\n")) {
      await api.v1.lorebook.updateEntry(entryId, {
        text: entry.text.slice(5),
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
  const attgSyncEnabled = await api.v1.storyStorage.get("kse-sync-attg-memory");
  if (attgSyncEnabled) {
    const attgContent = String((await api.v1.storyStorage.get("kse-field-attg")) || "");
    if (attgContent) {
      await api.v1.memory.set(await attgForMemory(attgContent));
    }
  }
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
        (await api.v1.storyStorage.get(`dulfs-item-${item.id}`)) || "";

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
    await api.v1.storyStorage.set(`dulfs-item-${itemId}`, null);

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
      ];

      for (const key of allKeys) {
        if (patternsToRemove.some((pattern) => pattern.test(key))) {
          await api.v1.storyStorage.remove(key);
        }
      }

      dispatch(queueCleared());
    },
  );
}
