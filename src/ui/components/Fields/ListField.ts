import {
  createEvents,
  mergeStyles,
  defineComponent,
} from "../../../../lib/nai-act";
import { RootState } from "../../../core/store/types";
import { FieldConfig, DulfsFieldID } from "../../../config/field-definitions";
import {
  dulfsSummaryUpdated,
  dulfsItemAdded,
} from "../../../core/store/slices/story";
import { uiEditModeToggled } from "../../../core/store/slices/ui";
import { generationRequested } from "../../../core/store/slices/runtime";
import { GenerationButton } from "../GenerationButton";
import { ListItem } from "./ListItem";
import {
  StyledCollapsibleSection,
  SummaryBox,
  SummaryInput,
  IconButton,
  StandardButton,
  Styles,
} from "../../styles";

export type ListFieldProps = FieldConfig;

const { row, text, column } = api.v1.ui.part;

type ListFieldEvents = {
  toggleSummaryEdit(): void;
  handleSummaryInput(val: string): void;
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
    summaryHeader: {
      "justify-content": "space-between",
      "align-items": "center",
    },
    summaryLabel: { "font-weight": "bold", opacity: "0.7" },
    buttonGroup: { gap: "4px" },
    summaryText: { opacity: 0.8 },
    itemsColumn: { gap: "4px" },
    actionsRow: { "margin-top": "8px", gap: "8px", "flex-wrap": "wrap" },
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
    }) as UIPart;

    return StyledCollapsibleSection({
      id: `section-${props.id}`,
      title: props.label,
      iconId: props.icon,
      storageKey: `story:kse-section-${props.id}`,
      content: [
        text({
          text: props.description,
          style: this.styles?.description,
        }),
        // Summary Section
        SummaryBox({
          content: [
            row({
              style: this.styles?.summaryHeader,
              content: [
                text({
                  text: "Category Summary",
                  style: this.styles?.summaryLabel,
                }),
                row({
                  style: this.styles?.buttonGroup,
                  content: [
                    IconButton({
                      id: summaryEditBtnId,
                      iconId: "edit-3",
                      callback: () => this.events.toggleSummaryEdit(props),
                    }),
                    IconButton({
                      id: summarySaveBtnId,
                      iconId: "save",
                      style: { display: "none" },
                      callback: () => this.events.saveSummary(props),
                    }),
                  ],
                }),
              ],
            }),
            SummaryInput({
              id: summaryInputId,
              placeholder: "Summary...",
              initialValue: "",
              storageKey: `story:dulfs-summary-draft-${props.id}`,
              onChange: (val) => this.events.handleSummaryInput(props, val),
              style: { display: "none" },
            }),
            text({
              id: summaryTextId,
              text: "_No summary._",
              style: this.styles?.summaryText,
            }),
          ],
        }),
        // Items List
        column({
          id: `items-col-${props.id}`,
          style: this.styles?.itemsColumn,
          content: [], // Populated in onMount
        }),
        // Actions
        row({
          style: this.styles?.actionsRow,
          content: [
            genButton,
            StandardButton({
              text: "Add Item",
              iconId: "plus",
              callback: () => this.events.addItem(props),
            }),
          ],
        }),
      ],
    });
  },

  onMount(props, ctx) {
    const { useSelector, dispatch } = ctx;

    const summaryEditBtnId = `summary-edit-btn-${props.id}`;
    const summarySaveBtnId = `summary-save-btn-${props.id}`;
    const summaryInputId = `summary-input-${props.id}`;
    const summaryTextId = `summary-text-${props.id}`;
    const itemsColId = `items-col-${props.id}`;

    let currentSummaryDraft = "";
    const boundItems = new Set<string>();

    this.events.attach({
      toggleSummaryEdit: (eventProps) => {
        dispatch(uiEditModeToggled({ id: eventProps.id }));
      },
      saveSummary: (eventProps) => {
        dispatch(
          dulfsSummaryUpdated({
            fieldId: eventProps.id,
            summary: currentSummaryDraft,
          }),
        );
        dispatch(uiEditModeToggled({ id: eventProps.id }));
      },
      handleSummaryInput: (_eventProps, val) => {
        currentSummaryDraft = val;
      },
      addItem: (eventProps) => {
        dispatch(
          dulfsItemAdded({
            fieldId: eventProps.id as DulfsFieldID,
            item: {
              id: api.v1.uuid(),
              fieldId: eventProps.id as DulfsFieldID,
              name: "New Item",
              content: "",
            },
          }),
        );
      },
    });

    // React to Edit Mode changes
    useSelector(
      (state) => state.ui.editModes[props.id],
      (isEditing) => {
        api.v1.ui.updateParts([
          {
            id: summaryEditBtnId,
            style: mergeStyles(Styles.iconButton, {
              display: isEditing ? "none" : "block",
            }),
          },
          {
            id: summarySaveBtnId,
            style: mergeStyles(Styles.iconButton, {
              display: isEditing ? "block" : "none",
            }),
          },
          {
            id: summaryInputId,
            style: mergeStyles(Styles.textArea, {
              display: isEditing ? "block" : "none",
            }),
          },
          {
            id: summaryTextId,
            style: mergeStyles(this.styles?.summaryText, {
              display: isEditing ? "none" : "block",
            }),
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

    // Sync Summary
    useSelector(
      (state) => state.story.dulfsSummaries[props.id],
      (summary) => {
        const safeSummary = summary || "";
        // Initialize draft if empty (first load)
        if (!currentSummaryDraft) currentSummaryDraft = safeSummary;

        api.v1.ui.updateParts([
          { id: summaryTextId, text: safeSummary },
          {
            id: summaryInputId,
            initialValue: safeSummary,
          },
        ]);
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
