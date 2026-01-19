import { RootState } from "../../core/store/types";
import { Dispatch } from "../../core/store";
import { FieldConfig, DulfsFieldID } from "../../config/field-definitions";
import {
  uiEditModeToggled,
  uiInputChanged,
  fieldUpdated,
  generationRequested,
  generationCancelled,
  dulfsItemAdded,
  dulfsItemUpdated,
  dulfsItemRemoved,
  dulfsSummaryUpdated,
} from "../../core/store/actions";
import {
  createHeaderWithToggle,
  createToggleableContent,
  createResponsiveGenerateButton,
} from "../ui-components";

const { row, column, text, button, textInput, collapsibleSection } =
  api.v1.ui.part;

export const renderField = (
  config: FieldConfig,
  state: RootState,
  dispatch: Dispatch,
): UIPart => {
  if (config.layout === "list") {
    return renderListField(config, state, dispatch);
  }
  return renderTextField(config, state, dispatch);
};

const renderTextField = (
  config: FieldConfig,
  state: RootState,
  dispatch: Dispatch,
): UIPart => {
  const isEditing = state.ui.editModes[config.id] || false;
  const content = state.story.fields[config.id]?.content || "";
  const draftKey = `field-draft-${config.id}`;
  const draft =
    state.ui.inputs[draftKey] !== undefined
      ? state.ui.inputs[draftKey]
      : content;

  // Request ID for generation
  const requestId = `gen-${config.id}`; // Simple mapping for now
  const request =
    state.runtime.queue.find((r) => r.id === requestId) ||
    (state.runtime.activeRequest?.id === requestId
      ? state.runtime.activeRequest
      : null);

  const isGenerating = !!request;
  const isQueued = state.runtime.queue.some((r) => r.id === requestId);
  // Note: Budget state is global in runtime, but could be specific if we tracked it per request.
  // For now assuming global budget applies to active request.

  const genButton = createResponsiveGenerateButton(
    `gen-btn-${config.id}`,
    {
      isRunning: isGenerating,
      isQueued: isQueued,
      budgetState: undefined, // Budget tracking simplified in V2
    },
    {
      onStart: () => {
        dispatch(
          generationRequested({
            id: requestId,
            type: "field",
            targetId: config.id,
          }),
        );
      },
      onCancel: () => {
        dispatch(generationCancelled({ requestId }));
      },
    },
    "Generate",
  );

  const onToggle = () => {
    if (isEditing) {
      // Save on exit
      dispatch(fieldUpdated({ fieldId: config.id, content: draft }));
    } else {
      // Init draft on enter
      dispatch(uiInputChanged({ id: draftKey, value: content }));
    }
    dispatch(uiEditModeToggled({ id: config.id }));
  };

  const sectionId = `section-${config.id}`;

  return collapsibleSection({
    id: sectionId,
    title: config.label,
    iconId: config.icon,
    // Using internal state management for collapse via callback if needed, but UIPart supports it natively?
    // Wait, collapsibleSection in script-types likely handles its own state or needs manual update?
    // script-types says "Collapsible section...". Usually these have internal state in UI,
    // but if we want to persist/control it, we might need to handle it.
    // However, standard UIPartCollapsibleSection often manages its own open/close unless we re-render.
    // If we re-render, we need to pass `collapsed` prop if it exists.
    // Checking script-types: `initialCollapsed`. It doesn't seem to have a controlled `collapsed` prop.
    // It has `storageKey`. We can use that!
    storageKey: `story:kse-section-${config.id}`,
    content: [
      createHeaderWithToggle(
        config.description,
        isEditing,
        onToggle,
        genButton,
      ),
      createToggleableContent(
        isEditing,
        isEditing ? draft : content,
        config.placeholder,
        `input-${config.id}`,
        (val) => dispatch(uiInputChanged({ id: draftKey, value: val })),
        {},
        `text-display-${config.id}`,
      ),
    ],
  });
};

const renderListField = (
  config: FieldConfig,
  state: RootState,
  dispatch: Dispatch,
): UIPart => {
  const list = state.story.dulfs[config.id as DulfsFieldID] || [];

  // Summary logic
  const summary = state.story.dulfsSummaries[config.id] || "";
  const summaryEditModeKey = `summary-edit-${config.id}`;
  const isSummaryEditing = state.ui.editModes[summaryEditModeKey] || false;
  const summaryDraftKey = `summary-draft-${config.id}`;
  const summaryDraft =
    state.ui.inputs[summaryDraftKey] !== undefined
      ? state.ui.inputs[summaryDraftKey]
      : summary;

  // List Generation
  const listGenId = `gen-list-${config.id}`;
  const isListGenRunning =
    state.runtime.activeRequest?.id === listGenId ||
    state.runtime.queue.some((r) => r.id === listGenId);

  // Header
  const sectionId = `section-${config.id}`;

  // Summary Part
  const summaryUI = column({
    style: {
      "margin-bottom": "8px",
      "background-color": "rgba(0,0,0,0.02)",
      padding: "4px",
      "border-radius": "4px",
    },
    content: [
      row({
        style: { "justify-content": "space-between", "align-items": "center" },
        content: [
          text({
            text: "Category Summary",
            style: { "font-weight": "bold", opacity: "0.7" },
          }),
          button({
            iconId: isSummaryEditing ? "save" : "edit-3",
            style: { width: "24px", padding: "4px" },
            callback: () => {
              if (isSummaryEditing) {
                dispatch(
                  dulfsSummaryUpdated({
                    fieldId: config.id,
                    summary: summaryDraft,
                  }),
                );
              } else {
                dispatch(
                  uiInputChanged({ id: summaryDraftKey, value: summary }),
                );
              }
              dispatch(uiEditModeToggled({ id: summaryEditModeKey }));
            },
          }),
        ],
      }),
      createToggleableContent(
        isSummaryEditing,
        isSummaryEditing ? summaryDraft : summary,
        "Summary...",
        `summary-input-${config.id}`,
        (val) => dispatch(uiInputChanged({ id: summaryDraftKey, value: val })),
        {},
        `summary-text-${config.id}`,
      ),
    ],
  });

  // Items
  const itemsUI = list.map((item) => {
    const itemEditKey = `item-edit-${item.id}`;
    const isEditing = state.ui.editModes[itemEditKey] || false;
    const itemDraftKey = `item-name-${item.id}`;
    const draftName =
      state.ui.inputs[itemDraftKey] !== undefined
        ? state.ui.inputs[itemDraftKey]
        : item.name;

    const itemGenId = `gen-item-${item.id}`;
    const isItemGenRunning =
      state.runtime.activeRequest?.id === itemGenId ||
      state.runtime.queue.some((r) => r.id === itemGenId);

    return row({
      style: {
        "margin-bottom": "4px",
        border: "1px solid rgba(128, 128, 128, 0.1)",
        "border-radius": "4px",
        padding: "2px 4px",
        "align-items": "center",
        gap: "4px",
      },
      content: [
        isEditing
          ? textInput({
              initialValue: draftName,
              onChange: (val) =>
                dispatch(uiInputChanged({ id: itemDraftKey, value: val })),
              style: { flex: 1 },
            })
          : text({
              text: item.name,
              style: { flex: 1, "font-weight": "bold" },
            }),

        // Generate Content Button
        createResponsiveGenerateButton(
          `btn-${itemGenId}`,
          { isRunning: isItemGenRunning },
          {
            onStart: () =>
              dispatch(
                generationRequested({
                  id: itemGenId,
                  type: "field",
                  targetId: `${config.id}:${item.id}`,
                }),
              ),
            onCancel: () =>
              dispatch(generationCancelled({ requestId: itemGenId })),
          },
          "",
        ),

        button({
          iconId: isEditing ? "save" : "edit-3",
          style: { width: "24px", padding: "4px" },
          callback: () => {
            if (isEditing) {
              dispatch(
                dulfsItemUpdated({
                  fieldId: config.id as DulfsFieldID,
                  itemId: item.id,
                  updates: { name: draftName },
                }),
              );
            } else {
              dispatch(uiInputChanged({ id: itemDraftKey, value: item.name }));
            }
            dispatch(uiEditModeToggled({ id: itemEditKey }));
          },
        }),
        button({
          iconId: "trash",
          style: { width: "24px", padding: "4px" },
          callback: () =>
            dispatch(
              dulfsItemRemoved({
                fieldId: config.id as DulfsFieldID,
                itemId: item.id,
              }),
            ),
        }),
      ],
    });
  });

  return collapsibleSection({
    id: sectionId,
    title: config.label,
    iconId: config.icon,
    storageKey: `story:kse-section-${config.id}`,
    content: [
      text({
        text: config.description,
        style: { "font-style": "italic", opacity: 0.8 },
      }),
      summaryUI,
      column({ content: itemsUI }),
      row({
        style: { "margin-top": "8px", gap: "4px" },
        content: [
          createResponsiveGenerateButton(
            `btn-${listGenId}`,
            { isRunning: isListGenRunning },
            {
              onStart: () =>
                dispatch(
                  generationRequested({
                    id: listGenId,
                    type: "list",
                    targetId: config.id,
                  }),
                ),
              onCancel: () =>
                dispatch(generationCancelled({ requestId: listGenId })),
            },
            "Generate Items",
          ),
          button({
            text: "Add Item",
            iconId: "plus",
            callback: () => {
              dispatch(
                dulfsItemAdded({
                  fieldId: config.id as DulfsFieldID,
                  item: {
                    id: api.v1.uuid(),
                    fieldId: config.id as DulfsFieldID,
                    name: "New Item",
                    content: "",
                  },
                }),
              );
            },
          }),
        ],
      }),
    ],
  });
};
