import { BindContext, defineComponent } from "../../../../lib/nai-act";
import { RootState } from "../../../core/store/types";
import { IDS } from "../../framework/ids";
import { GenerationButton } from "../GenerationButton";
import {
  lorebookContentGenerationRequested,
  lorebookKeysGenerationRequested,
} from "../../../core/store";

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
    const { useSelector, mount } = ctx;

    // Mount generation buttons with requestIds for independent state tracking
    mount(GenerationButton, {
      id: IDS.LOREBOOK.GEN_CONTENT_BTN,
      requestId: "lb-content-req",
      label: "Generate Lorebook",
      generateAction: lorebookContentGenerationRequested({
        requestId: "lb-content-req",
      }),
    });

    mount(GenerationButton, {
      id: IDS.LOREBOOK.GEN_KEYS_BTN,
      requestId: "lb-keys-req",
      label: "Generate Keys",
      generateAction: lorebookKeysGenerationRequested({
        requestId: "lb-keys-req",
      }),
    });

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

        // Show main content
        const displayName = entry.displayName || "Unnamed Entry";
        const currentContent = entry.text || "(No content yet)";
        const currentKeys = entry.keys?.join(", ") || "(No keys)";

        api.v1.ui.updateParts([
          { id: IDS.LOREBOOK.MAIN_CONTENT, style: { display: "flex" } },
          { id: IDS.LOREBOOK.ENTRY_NAME, text: displayName },
          { id: IDS.LOREBOOK.CONTENT_TEXT, text: currentContent },
          { id: IDS.LOREBOOK.KEYS_TEXT, text: currentKeys },
        ]);
      },
    );
  },
});
