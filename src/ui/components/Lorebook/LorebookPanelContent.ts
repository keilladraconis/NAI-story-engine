import { BindContext, defineComponent } from "../../../../lib/nai-act";
import { RootState } from "../../../core/store/types";
import { IDS } from "../../framework/ids";

const SE_CATEGORY_PREFIX = "SE: ";

export const LorebookPanelContent = defineComponent({
  id: () => IDS.LOREBOOK.CONTAINER,
  events: undefined,

  describe() {
    // Empty describe - structure is defined in index.ts
    // This component only handles reactivity
    return null as any;
  },

  onMount(_props: void, ctx: BindContext<RootState>) {
    const { useSelector } = ctx;

    let currentEntryId: string | null = null;

    // Subscribe to lorebook state changes
    useSelector(
      (state) => state.ui.lorebook.selectedEntryId,
      async (selectedEntryId) => {
        // Hide all states initially
        api.v1.ui.updateParts([
          { id: IDS.LOREBOOK.EMPTY_STATE, style: { display: "none" } },
          { id: IDS.LOREBOOK.NOT_MANAGED, style: { display: "none" } },
          { id: IDS.LOREBOOK.MAIN_CONTENT, style: { display: "none" } },
        ]);

        currentEntryId = selectedEntryId;

        // Nothing selected
        if (!selectedEntryId) {
          api.v1.ui.updateParts([
            { id: IDS.LOREBOOK.EMPTY_STATE, style: { display: "flex" } },
          ]);
          return;
        }

        // Fetch entry and category info
        const entry = await api.v1.lorebook.entry(selectedEntryId);
        if (!entry) {
          api.v1.ui.updateParts([
            { id: IDS.LOREBOOK.EMPTY_STATE, style: { display: "flex" } },
          ]);
          return;
        }

        // Get category name
        let categoryName = "";
        if (entry.category) {
          const categories = await api.v1.lorebook.categories();
          const category = categories.find((c) => c.id === entry.category);
          categoryName = category?.name || "";
        }

        // Check if SE-managed
        const isManaged = categoryName.startsWith(SE_CATEGORY_PREFIX);

        if (!isManaged) {
          api.v1.ui.updateParts([
            { id: IDS.LOREBOOK.NOT_MANAGED, style: { display: "flex" } },
          ]);
          return;
        }

        // Show main content with current values
        const displayName = entry.displayName || "Unnamed Entry";
        const currentContent = entry.text || "";
        const currentKeys = entry.keys?.join(", ") || "";

        // Set draft storage keys to current entry content
        // This populates the storageKey-bound inputs and enables streaming
        await api.v1.storyStorage.set(
          IDS.LOREBOOK.CONTENT_DRAFT_RAW,
          currentContent,
        );
        await api.v1.storyStorage.set(IDS.LOREBOOK.KEYS_DRAFT_RAW, currentKeys);

        // Show main content
        // Note: Generation buttons are managed by LorebookGenerationButton components
        // which self-update based on selectedEntryId changes
        api.v1.ui.updateParts([
          { id: IDS.LOREBOOK.MAIN_CONTENT, style: { display: "flex" } },
          { id: IDS.LOREBOOK.ENTRY_NAME, text: displayName },
        ]);

        // Set up onChange handlers for direct lorebook updates
        // When user edits, save to lorebook immediately
        api.v1.ui.updateParts([
          {
            id: IDS.LOREBOOK.CONTENT_INPUT,
            onChange: async (value: string) => {
              if (currentEntryId) {
                await api.v1.lorebook.updateEntry(currentEntryId, {
                  text: value,
                });
              }
            },
          },
          {
            id: IDS.LOREBOOK.KEYS_INPUT,
            onChange: async (value: string) => {
              if (currentEntryId) {
                const keys = value
                  .split(",")
                  .map((k) => k.trim())
                  .filter((k) => k.length > 0);
                await api.v1.lorebook.updateEntry(currentEntryId, { keys });
              }
            },
          },
        ]);
      },
    );
  },
});
