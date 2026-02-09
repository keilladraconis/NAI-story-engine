import { BindContext, defineComponent } from "../../../../lib/nai-act";
import { RootState } from "../../../core/store/types";
import { IDS } from "../../framework/ids";
import { GenerationButton } from "../GenerationButton";
import {
  uiLorebookContentGenerationRequested,
  uiLorebookKeysGenerationRequested,
  uiLorebookRefineRequested,
} from "../../../core/store/slices/ui";

const { column, text, row, textInput, multilineTextInput } = api.v1.ui.part;

const SE_CATEGORY_PREFIX = "SE: ";

export const LorebookPanelContent = defineComponent({
  id: () => IDS.LOREBOOK.CONTAINER,

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
    refineRow: { gap: "8px", "align-items": "center", "margin-top": "8px" },
    refineInput: { "font-size": "12px", flex: "1" },
    hidden: { display: "none" },
    visible: { display: "flex" },
  },

  build(_props: void, ctx: BindContext<RootState>) {
    const { useSelector, getState, dispatch } = ctx;

    let currentEntryId: string | null = null;

    // Render GenerationButton components
    const { part: contentBtn } = ctx.render(GenerationButton, {
      id: IDS.LOREBOOK.GEN_CONTENT_BTN,
      label: "Generate Content",
      stateProjection: (state: RootState) => state.ui.lorebook.selectedEntryId,
      requestIdFromProjection: (entryId: string | null) =>
        entryId ? IDS.LOREBOOK.entry(entryId).CONTENT_REQ : undefined,
      isDisabledFromProjection: (entryId: string | null) => !entryId,
      onGenerate: () => {
        const selectedEntryId = getState().ui.lorebook.selectedEntryId;
        if (selectedEntryId) {
          const requestId = IDS.LOREBOOK.entry(selectedEntryId).CONTENT_REQ;
          dispatch(uiLorebookContentGenerationRequested({ requestId }));
        }
      },
    });

    const { part: keysBtn } = ctx.render(GenerationButton, {
      id: IDS.LOREBOOK.GEN_KEYS_BTN,
      label: "Generate Keys",
      stateProjection: (state: RootState) => state.ui.lorebook.selectedEntryId,
      requestIdFromProjection: (entryId: string | null) =>
        entryId ? IDS.LOREBOOK.entry(entryId).KEYS_REQ : undefined,
      isDisabledFromProjection: (entryId: string | null) => !entryId,
      onGenerate: () => {
        const selectedEntryId = getState().ui.lorebook.selectedEntryId;
        if (selectedEntryId) {
          const requestId = IDS.LOREBOOK.entry(selectedEntryId).KEYS_REQ;
          dispatch(uiLorebookKeysGenerationRequested({ requestId }));
        }
      },
    });

    const { part: refineBtn } = ctx.render(GenerationButton, {
      id: IDS.LOREBOOK.REFINE_BTN,
      label: "Refine",
      stateProjection: (state: RootState) => state.ui.lorebook.selectedEntryId,
      requestIdFromProjection: (entryId: string | null) =>
        entryId ? IDS.LOREBOOK.entry(entryId).REFINE_REQ : undefined,
      onGenerate: () => {
        const selectedEntryId = getState().ui.lorebook.selectedEntryId;
        if (selectedEntryId) {
          const requestId = IDS.LOREBOOK.entry(selectedEntryId).REFINE_REQ;
          dispatch(uiLorebookRefineRequested({ requestId }));
        }
      },
    });

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
        api.v1.ui.updateParts([
          {
            id: IDS.LOREBOOK.MAIN_CONTENT,
            style: this.style?.("mainContent", "visible"),
          },
          { id: IDS.LOREBOOK.ENTRY_NAME, text: displayName },
        ]);

        // Set up onChange handlers for direct lorebook updates
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
            // Generation buttons (directly composed)
            row({
              style: this.style?.("buttonRow"),
              content: [contentBtn, keysBtn],
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
            // Refine row (instructions input + button)
            row({
              style: this.style?.("refineRow"),
              content: [
                textInput({
                  id: IDS.LOREBOOK.REFINE_INSTRUCTIONS_INPUT,
                  initialValue: "",
                  placeholder: "Describe changes (e.g., 'Make them shorter, change race to halfling')",
                  storageKey: IDS.LOREBOOK.REFINE_INSTRUCTIONS_KEY,
                  style: this.style?.("refineInput"),
                }),
                refineBtn,
              ],
            }),
          ],
        }),
      ],
    });
  },
});
