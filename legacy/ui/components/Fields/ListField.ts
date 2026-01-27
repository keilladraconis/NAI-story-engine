import { Component, createEvents } from "../../../../lib/nai-act";
import { RootState } from "../../../core/store/types";
import { FieldConfig, DulfsFieldID } from "../../../config/field-definitions";
import {
  uiEditModeToggled,
  uiInputChanged,
  dulfsSummaryUpdated,
  dulfsItemAdded,
} from "../../../core/store/actions";
import { GenerationButton } from "../GenerationButton";
import { createToggleableContent } from "../../ui-components";
import { ListItem } from "./ListItem";

export interface ListFieldProps {
  config: FieldConfig;
}

const { column, row, text, button, collapsibleSection } = api.v1.ui.part;

const events = createEvents({
  toggleSummaryEdit: (
    props: ListFieldProps,
    summary: string,
    draft: string,
    isEditing: boolean,
  ) => {
    if (isEditing) {
      dulfsSummaryUpdated({ fieldId: props.config.id, summary: draft });
    } else {
      uiInputChanged({
        id: `summary-draft-${props.config.id}`,
        value: summary,
      });
    }
    uiEditModeToggled({ id: `summary-edit-${props.config.id}` });
  },
  summaryChange: (props: ListFieldProps, val: string) => {
    uiInputChanged({ id: `summary-draft-${props.config.id}`, value: val });
  },
  addItem: (props: ListFieldProps) => {
    dulfsItemAdded({
      fieldId: props.config.id as DulfsFieldID,
      item: {
        id: api.v1.uuid(),
        fieldId: props.config.id as DulfsFieldID,
        name: "New Item",
        content: "",
      },
    });
  },
});

export const ListField: Component<ListFieldProps, RootState> = {
  id: (props) => `section-${props.config.id}`,

  describe(props, state) {
    const { config } = props;
    if (!state)
      return collapsibleSection({
        id: `section-${config.id}`,
        title: config.label,
        content: [],
      });

    const list = state.story.dulfs[config.id as DulfsFieldID] || [];

    // Summary State
    const summary = state.story.dulfsSummaries[config.id] || "";
    const summaryEditKey = `summary-edit-${config.id}`;
    const isSummaryEditing = state.ui.editModes[summaryEditKey] || false;
    const summaryDraftKey = `summary-draft-${config.id}`;
    const summaryDraft =
      state.ui.inputs[summaryDraftKey] !== undefined
        ? state.ui.inputs[summaryDraftKey]
        : summary;

    // List Generation Button
    const listGenId = `gen-list-${config.id}`;
    const genButton = GenerationButton.describe(
      {
        id: `btn-${listGenId}`,
        requestId: listGenId,
        request: {
          id: listGenId,
          type: "list",
          targetId: config.id,
        },
        label: "Generate Items",
      },
      state,
    ) as UIPart;

    // Summary UI
    const summaryUI = column({
      style: {
        "margin-bottom": "8px",
        "background-color": "rgba(0,0,0,0.02)",
        padding: "4px",
        "border-radius": "4px",
      },
      content: [
        row({
          style: {
            "justify-content": "space-between",
            "align-items": "center",
          },
          content: [
            text({
              text: "Category Summary",
              style: { "font-weight": "bold", opacity: "0.7" },
            }),
            button({
              id: `summary-toggle-${config.id}`,
              iconId: isSummaryEditing ? "save" : "edit-3",
              style: { width: "24px", padding: "4px" },
              callback: () =>
                events.toggleSummaryEdit(
                  props,
                  summary,
                  summaryDraft,
                  isSummaryEditing,
                ),
            }),
          ],
        }),
        createToggleableContent(
          isSummaryEditing,
          isSummaryEditing ? summaryDraft : summary,
          "Summary...",
          `summary-input-${config.id}`,
          (val) => events.summaryChange(props, val),
          {},
          `summary-text-${config.id}`, // Preserve ID for streaming
        ),
      ],
    });

    // Items UI
    // describe() is called initially. We don't have dispatch. So items won't work until bind() patches them?
    // But ListItem.describe needs dispatch to make GenerationButton work immediately.
    // Since ListField.describe can't provide it, initial items are broken?
    // NO! ListField.bind calls GenerationButton.bind (and ListItem.bind).
    // ListItem.bind calls GenerationButton.bind.
    // So initial items get bound correctly.
    // The issue is ONLY for re-rendered items.
    // Re-rendered items are created in ListField.bind -> useSelector -> updateParts -> ListField.describe??
    // NO. In bind, we construct the parts manually or call a helper.
    // We should NOT call ListField.describe inside bind if we can avoid it.
    // We should construct the item list manually inside bind and pass dispatch!

    const itemsUI = list.map(
      (item) => ListItem.describe({ config, item }, state) as UIPart,
    );

    return collapsibleSection({
      id: `section-${config.id}`,
      title: config.label,
      iconId: config.icon,
      storageKey: `story:kse-section-${config.id}`,
      content: [
        text({
          text: config.description,
          style: { "font-style": "italic", opacity: 0.8 },
        }),
        summaryUI,
        column({
          id: `items-col-${config.id}`,
          content: itemsUI,
        }),
        row({
          style: { "margin-top": "8px", gap: "4px" },
          content: [
            genButton,
            button({
              text: "Add Item",
              iconId: "plus",
              callback: () => events.addItem(props),
            }),
          ],
        }),
      ],
    });
  },

  bind(ctx, props) {
    const { useSelector, updateParts, dispatch } = ctx;
    const { config } = props;

    // Bind Main List Gen Button
    const listGenId = `gen-list-${config.id}`;
    GenerationButton.bind(ctx, {
      id: `btn-${listGenId}`,
      requestId: listGenId,
      request: { id: listGenId, type: "list", targetId: config.id },
      label: "Generate Items",
    });

    const boundItems = new Set<string>();

    // Watch List Changes
    useSelector(
      (state) => ({
        list: state.story.dulfs[config.id as DulfsFieldID] || [],
        // We also need root state to render items correctly
        state, // Pass full state to render items? Or minimal?
        // ListItem.describe needs RootState.
      }),
      (slice) => {
        const list = slice.list;

        // 1. Bind new items
        list.forEach((item) => {
          if (!boundItems.has(item.id)) {
            ListItem.bind(ctx, { config, item, dispatch });
            boundItems.add(item.id);
          }
        });

        // 2. Render List
        // We MUST pass dispatch here so re-created buttons get callbacks!
        const itemsUI = list.map(
          (item) =>
            ListItem.describe(
              { config, item, dispatch },
              slice.state,
            ) as UIPart,
        );

        // Update the column
        updateParts([
          {
            id: `items-col-${config.id}`,
            content: itemsUI,
          },
        ]);
      },
    );

    // Watch Summary Changes separately to avoid re-rendering list
    useSelector(
      (state) => ({
        summary: state.story.dulfsSummaries[config.id],
        summaryEdit: state.ui.editModes[`summary-edit-${config.id}`],
        summaryDraft: state.ui.inputs[`summary-draft-${config.id}`],
      }),
      (slice) => {
        const isEditing = !!slice.summaryEdit;
        const summary = slice.summary || "";
        const draft =
          slice.summaryDraft !== undefined ? slice.summaryDraft : summary;

        updateParts([
          {
            id: `summary-toggle-${config.id}`,
            iconId: isEditing ? "save" : "edit-3",
            callback: () =>
              events.toggleSummaryEdit(props, summary, draft, isEditing),
          },
          {
            id: `summary-input-${config.id}`,
            style: { display: isEditing ? "block" : "none" },
          },
          {
            id: `summary-text-${config.id}`,
            style: { display: isEditing ? "none" : "block" },
            text: summary,
          },
        ]);
      },
    );
  },
};
