import { Store } from "../store";
import { RootState } from "../types";
import { dulfsItemUpdated } from "../actions";
import { FIELD_CONFIGS, DulfsFieldID } from "../../../config/field-definitions";

export const lorebookSyncSubscriber = (store: Store<RootState>) => {
  let lastState = store.getState();

  store.subscribe(async (state, action) => {
    if (action.type === "story/dulfsItemUpdated") {
      const { fieldId, itemId, updates } = action.payload;

      // Avoid infinite loop: only sync if content or name changed, NOT if we just updated the ID
      if (updates.content !== undefined || updates.name !== undefined) {
        await syncItem(state, fieldId, itemId);
      }
    }

    if (action.type === "story/dulfsItemRemoved") {
      const { fieldId, itemId } = action.payload;
      const prevList = lastState.story.dulfs[fieldId as DulfsFieldID] || [];
      const item = prevList.find((i) => i.id === itemId);
      if (item && item.lorebookEntryId) {
        try {
          await api.v1.lorebook.removeEntry(item.lorebookEntryId);
        } catch (e) {
          // Ignore
        }
      }
    }

    lastState = state;
  });

  async function syncItem(state: RootState, fieldId: string, itemId: string) {
    const list = state.story.dulfs[fieldId as DulfsFieldID];
    const item = list?.find((i) => i.id === itemId);
    if (!item) return;

    // Ensure Category Exists
    const config = FIELD_CONFIGS.find((c) => c.id === fieldId);
    const catName = `SE: ${config?.label || fieldId}`;

    // This is not efficient to check every time, but robust.
    // Optimization: Cache category IDs.
    let catId = (await api.v1.lorebook.categories()).find(
      (c) => c.name === catName,
    )?.id;
    if (!catId) {
      catId = api.v1.uuid();
      await api.v1.lorebook.createCategory({
        id: catId,
        name: catName,
        enabled: true,
      });
    }

    if (item.lorebookEntryId) {
      // Update existing
      // Check if entry exists first? NAI throws if not found?
      // updateEntry allows partial updates.
      try {
        await api.v1.lorebook.updateEntry(item.lorebookEntryId, {
          displayName: item.name,
          text: item.content,
          category: catId,
        });
      } catch (e) {
        // If failed (e.g. deleted externally), maybe recreate?
        // For now, log.
        api.v1.log("Failed to sync entry update", e);
      }
    } else {
      // Create new
      // Only create if we have content or name
      if (
        (item.content && item.content.length > 0) ||
        (item.name && item.name.length > 0)
      ) {
        const newId = api.v1.uuid();
        try {
          await api.v1.lorebook.createEntry({
            id: newId,
            displayName: item.name,
            text: item.content || "",
            category: catId,
            enabled: true,
          });
          // Update state with new ID
          store.dispatch(
            dulfsItemUpdated({
              fieldId: fieldId as DulfsFieldID,
              itemId,
              updates: { lorebookEntryId: newId },
            }),
          );
        } catch (e) {
          api.v1.log("Failed to create entry", e);
        }
      }
    }
  }
};