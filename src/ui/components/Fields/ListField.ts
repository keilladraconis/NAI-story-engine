import { createEvents, defineComponent } from "../../../../lib/nai-act";
import { RootState } from "../../../core/store/types";
import { FieldConfig, DulfsFieldID } from "../../../config/field-definitions";
import {
  dulfsSummaryUpdated,
  dulfsItemAdded,
} from "../../../core/store/slices/story";
import {
  uiFieldEditBegin,
  uiFieldEditEnd,
} from "../../../core/store/slices/ui";
import { generationRequested } from "../../../core/store/slices/runtime";
import { GenerationButton } from "../GenerationButton";
import { ListItem } from "./ListItem";

export type ListFieldProps = FieldConfig;

const { row, text, column, button, collapsibleSection, multilineTextInput } =
  api.v1.ui.part;

type ListFieldEvents = {
  beginSummaryEdit(): void;
  saveSummary(): void;
  addItem(): void;
};

export const ListField = defineComponent<
  ListFieldProps,
  RootState,
  ReturnType<typeof createEvents<ListFieldProps, ListFieldEvents>>
>({
  id: (props) => `section-${props.id}`,
  events: createEvents<ListFieldProps, ListFieldEvents>(),

  styles: {
    description: {
      "font-style": "italic",
      opacity: 0.8,
      "margin-bottom": "8px",
    },
    summaryBox: {
      "margin-bottom": "12px",
      "background-color": "rgba(128, 128, 128, 0.05)",
      padding: "8px",
      "border-radius": "4px",
      gap: "4px",
    },
    summaryHeader: {
      "justify-content": "space-between",
      "align-items": "center",
    },
    summaryLabel: { "font-weight": "bold", opacity: "0.7" },
    buttonGroup: { gap: "4px" },
    summaryText: { opacity: 0.8 },
    summaryInput: { "min-height": "60px" },
    itemsColumn: { gap: "4px" },
    actionsRow: { "margin-top": "8px", gap: "8px", "flex-wrap": "wrap" },
    iconButton: { width: "24px", padding: "4px" },
    standardButton: { padding: "4px 8px" },
    hidden: { display: "none" },
    visible: { display: "block" },
  },

  describe(props) {
    const listGenId = `gen-list-${props.id}`;

    const summaryEditBtnId = `summary-edit-btn-${props.id}`;
    const summarySaveBtnId = `summary-save-btn-${props.id}`;
    const summaryInputId = `summary-input-${props.id}`;
    const summaryTextId = `summary-text-${props.id}`;

    const genButton = GenerationButton.describe({
      id: `gen-btn-${listGenId}`,
      requestId: listGenId,
      label: "Generate Items",
      generateAction: generationRequested({
        id: listGenId,
        type: "list",
        targetId: props.id,
      }),
    }) as UIPart;

    return collapsibleSection({
      id: `section-${props.id}`,
      title: props.label,
      iconId: props.icon,
      storageKey: `story:kse-section-${props.id}`,
      content: [
        text({
          text: props.description,
          style: this.style?.("description"),
        }),
        // Summary Section
        column({
          style: this.style?.("summaryBox"),
          content: [
            row({
              style: this.style?.("summaryHeader"),
              content: [
                text({
                  text: "Category Summary",
                  style: this.style?.("summaryLabel"),
                }),
                row({
                  style: this.style?.("buttonGroup"),
                  content: [
                    button({
                      id: summaryEditBtnId,
                      iconId: "edit-3",
                      style: this.style?.("iconButton"),
                      callback: () => this.events.beginSummaryEdit(props),
                    }),
                    button({
                      id: summarySaveBtnId,
                      iconId: "save",
                      style: this.style?.("iconButton", "hidden"),
                      callback: () => this.events.saveSummary(props),
                    }),
                  ],
                }),
              ],
            }),
            multilineTextInput({
              id: summaryInputId,
              placeholder: "Summary...",
              initialValue: "",
              storageKey: `story:dulfs-summary-draft-${props.id}`,
              style: this.style?.("summaryInput", "hidden"),
            }),
            text({
              id: summaryTextId,
              text: "_No summary._",
              style: this.style?.("summaryText"),
            }),
          ],
        }),
        // Items List
        column({
          id: `items-col-${props.id}`,
          style: this.style?.("itemsColumn"),
          content: [], // Populated in onMount
        }),
        // Actions
        row({
          style: this.style?.("actionsRow"),
          content: [
            genButton,
            button({
              text: "Add Item",
              iconId: "plus",
              style: this.style?.("standardButton"),
              callback: () => this.events.addItem(props),
            }),
          ],
        }),
      ],
    });
  },

  onMount(props, ctx) {
    const { useSelector, useEffect, dispatch } = ctx;

    const summaryEditBtnId = `summary-edit-btn-${props.id}`;
    const summarySaveBtnId = `summary-save-btn-${props.id}`;
    const summaryInputId = `summary-input-${props.id}`;
    const summaryTextId = `summary-text-${props.id}`;
    const itemsColId = `items-col-${props.id}`;
    const summaryStorageKey = `dulfs-summary-draft-${props.id}`;

    const boundItems = new Set<string>();

    // Event handlers only dispatch intents
    this.events.attach({
      beginSummaryEdit: (eventProps) => {
        dispatch(uiFieldEditBegin({ id: eventProps.id }));
      },
      saveSummary: (eventProps) => {
        dispatch(uiFieldEditEnd({ id: eventProps.id }));
      },
      addItem: async (eventProps) => {
        const itemId = api.v1.uuid();
        await api.v1.storyStorage.set(`dulfs-item-${itemId}`, "New Item");
        dispatch(
          dulfsItemAdded({
            fieldId: eventProps.id as DulfsFieldID,
            item: {
              id: itemId,
              fieldId: eventProps.id as DulfsFieldID,
            },
          }),
        );
      },
    });

    type FieldAction = { type: string; payload: { id: string } };

    // Effect: Handle edit begin - push current content to storage
    useEffect(
      (action) =>
        action.type === uiFieldEditBegin({ id: "" }).type &&
        (action as FieldAction).payload.id === props.id,
      async (_action, { getState }) => {
        const summary = getState().story.dulfsSummaries[props.id] || "";
        await api.v1.storyStorage.set(summaryStorageKey, summary);
      },
    );

    // Effect: Handle save - read from storage and update state
    useEffect(
      (action) =>
        action.type === uiFieldEditEnd({ id: "" }).type &&
        (action as FieldAction).payload.id === props.id,
      async (_action, { dispatch }) => {
        const summary =
          (await api.v1.storyStorage.get(summaryStorageKey)) || "";
        dispatch(
          dulfsSummaryUpdated({
            fieldId: props.id,
            summary: String(summary),
          }),
        );
      },
    );

    // React to Edit Mode changes
    useSelector(
      (state) => state.ui.editModes[props.id],
      (isEditing) => {
        api.v1.ui.updateParts([
          {
            id: summaryEditBtnId,
            style: this.style?.("iconButton", isEditing ? "hidden" : "visible"),
          },
          {
            id: summarySaveBtnId,
            style: this.style?.("iconButton", isEditing ? "visible" : "hidden"),
          },
          {
            id: summaryInputId,
            style: this.style?.("summaryInput", isEditing ? "visible" : "hidden"),
          },
          {
            id: summaryTextId,
            style: this.style?.("summaryText", isEditing ? "hidden" : "visible"),
          },
        ]);
      },
    );

    // Bind Category Gen Button
    const listGenId = `gen-list-${props.id}`;
    ctx.mount(GenerationButton, {
      id: `gen-btn-${listGenId}`,
      requestId: listGenId,
      label: "Generate Items",
      generateAction: generationRequested({
        id: listGenId,
        type: "list",
        targetId: props.id,
      }),
    });

    // Sync Summary -> Display
    useSelector(
      (state) => state.story.dulfsSummaries[props.id],
      (summary) => {
        const safeSummary = summary || "";
        api.v1.ui.updateParts([{ id: summaryTextId, text: safeSummary }]);
      },
    );

    // Sync Items
    useSelector(
      (state) => state.story.dulfs[props.id as DulfsFieldID] || [],
      (list) => {
        // 1. Mount new items
        list.forEach((item) => {
          if (!boundItems.has(item.id)) {
            ctx.mount(ListItem, { config: props, item });
            boundItems.add(item.id);
          }
        });

        // 2. Re-render list structure
        api.v1.ui.updateParts([
          {
            id: itemsColId,
            content: list.map((item) =>
              ListItem.describe({ config: props, item }),
            ),
          },
        ]);
      },
    );
  },
});
