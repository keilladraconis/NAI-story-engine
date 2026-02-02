import { BindContext, defineComponent } from "../../../../lib/nai-act";
import { RootState } from "../../../core/store/types";
import { IDS } from "../../framework/ids";
import { GenerationButton } from "../GenerationButton";

const { column, text, row, textInput, multilineTextInput } = api.v1.ui.part;

const SE_CATEGORY_PREFIX = "SE: ";

export const LorebookPanelContent = defineComponent({
  id: () => IDS.LOREBOOK.CONTAINER,
  events: undefined,

  styles: {
    container: { height: "100%" },
    stateContainer: {
      display: "flex",
      "align-items": "center",
      "justify-content": "center",
      padding: "20px",
      color: "rgba(255,255,255,0.5)",
    },
    mainContent: { height: "100%" },
    entryName: { "font-weight": "bold", "font-size": "16px" },
    buttonRow: { gap: "8px", "margin-top": "4px" },
    contentInput: { "font-size": "13px", flex: "auto" },
    keysRow: { gap: "8px", "align-items": "center" },
    keysLabel: {
      "font-size": "12px",
      color: "rgba(255,255,255,0.6)",
      "white-space": "nowrap",
    },
    keysInput: { "font-size": "12px", flex: "1" },
    hidden: { display: "none" },
    visible: { display: "flex" },
  },

  describe(_props: void) {
    return column({
      id: IDS.LOREBOOK.CONTAINER,
      style: this.style?.("container"),
      content: [
        // Empty state
        column({
          id: IDS.LOREBOOK.EMPTY_STATE,
          style: this.style?.("stateContainer", "visible"),
          content: [
            text({ text: "Select a Lorebook entry to generate content." }),
          ],
        }),
        // Not managed state
        column({
          id: IDS.LOREBOOK.NOT_MANAGED,
          style: this.style?.("stateContainer", "hidden"),
          content: [
            text({
              text: "This entry is not managed by Story Engine.\nOnly entries in SE: categories can be generated.",
            }),
          ],
        }),
        // Main content
        column({
          id: IDS.LOREBOOK.MAIN_CONTENT,
          style: this.style?.("mainContent", "hidden"),
          content: [
            // Entry name header
            text({
              id: IDS.LOREBOOK.ENTRY_NAME,
              text: "",
              style: this.style?.("entryName"),
            }),
            // Generation buttons
            row({
              style: this.style?.("buttonRow"),
              content: [
                GenerationButton.describe({
                  id: IDS.LOREBOOK.GEN_CONTENT_BTN,
                  label: "Generate Content",
                }),
                GenerationButton.describe({
                  id: IDS.LOREBOOK.GEN_KEYS_BTN,
                  label: "Generate Keys",
                }),
              ],
            }),
            // Content area (editable - multiline textarea, storageKey for streaming)
            multilineTextInput({
              id: IDS.LOREBOOK.CONTENT_INPUT,
              initialValue: "",
              placeholder: "Lorebook content...",
              storageKey: IDS.LOREBOOK.CONTENT_DRAFT_KEY,
              style: this.style?.("contentInput"),
            }),
            // Keys input (editable)
            row({
              style: this.style?.("keysRow"),
              content: [
                text({
                  text: "Keys:",
                  style: this.style?.("keysLabel"),
                }),
                textInput({
                  id: IDS.LOREBOOK.KEYS_INPUT,
                  initialValue: "",
                  placeholder: "comma, separated, keys",
                  storageKey: IDS.LOREBOOK.KEYS_DRAFT_KEY,
                  style: this.style?.("keysInput"),
                }),
              ],
            }),
          ],
        }),
      ],
    });
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
          {
            id: IDS.LOREBOOK.EMPTY_STATE,
            style: this.style?.("stateContainer", "hidden"),
          },
          {
            id: IDS.LOREBOOK.NOT_MANAGED,
            style: this.style?.("stateContainer", "hidden"),
          },
          {
            id: IDS.LOREBOOK.MAIN_CONTENT,
            style: this.style?.("mainContent", "hidden"),
          },
        ]);

        currentEntryId = selectedEntryId;

        // Nothing selected
        if (!selectedEntryId) {
          api.v1.ui.updateParts([
            {
              id: IDS.LOREBOOK.EMPTY_STATE,
              style: this.style?.("stateContainer", "visible"),
            },
          ]);
          return;
        }

        // Fetch entry and category info
        const entry = await api.v1.lorebook.entry(selectedEntryId);
        if (!entry) {
          api.v1.ui.updateParts([
            {
              id: IDS.LOREBOOK.EMPTY_STATE,
              style: this.style?.("stateContainer", "visible"),
            },
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
            {
              id: IDS.LOREBOOK.NOT_MANAGED,
              style: this.style?.("stateContainer", "visible"),
            },
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
          {
            id: IDS.LOREBOOK.MAIN_CONTENT,
            style: this.style?.("mainContent", "visible"),
          },
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
