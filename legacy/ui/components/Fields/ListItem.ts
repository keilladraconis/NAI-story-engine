import { Component, createEvents } from "../../../../lib/nai-act";
import { RootState } from "../../../core/store/types";
import { FieldConfig, DulfsFieldID } from "../../../config/field-definitions";
import { DulfsItem } from "../../../core/store/types";
import {
  uiEditModeToggled,
  uiInputChanged,
  dulfsItemUpdated,
  dulfsItemRemoved,
} from "../../../core/store/actions";
import { GenerationButton } from "../GenerationButton";

export interface ListItemProps {
  config: FieldConfig;
  item: DulfsItem;
  dispatch?: (action: any) => void;
}

const { row, text, button, textInput } = api.v1.ui.part;

const events = createEvents({
  toggleEdit: (props: ListItemProps, draftName: string, isEditing: boolean) => {
    if (isEditing) {
      dulfsItemUpdated({
        fieldId: props.config.id as DulfsFieldID,
        itemId: props.item.id,
        updates: { name: draftName },
      });
    } else {
      uiInputChanged({
        id: `item-name-${props.item.id}`,
        value: props.item.name,
      });
    }
    uiEditModeToggled({ id: `item-edit-${props.item.id}` });
  },
  inputChange: (props: ListItemProps, val: string) => {
    uiInputChanged({ id: `item-name-${props.item.id}`, value: val });
  },
  delete: (props: ListItemProps) => {
    dulfsItemRemoved({
      fieldId: props.config.id as DulfsFieldID,
      itemId: props.item.id,
    });
  },
});

export const ListItem: Component<ListItemProps, RootState> = {
  id: (props) => `item-row-${props.item.id}`,

  describe(props, state) {
    const { item, config, dispatch } = props;
    if (!state)
      return row({
        id: `item-row-${item.id}`,
        content: [text({ text: item.name })],
      });

    const itemEditKey = `item-edit-${item.id}`;
    const isEditing = state.ui.editModes[itemEditKey] || false;
    const itemDraftKey = `item-name-${item.id}`;
    const draftName =
      state.ui.inputs[itemDraftKey] !== undefined
        ? state.ui.inputs[itemDraftKey]
        : item.name;

    const requestId = `gen-item-${item.id}`;

    // Visibility Toggling for Edit/View
    const inputDisplay = isEditing ? "block" : "none";
    const textDisplay = isEditing ? "none" : "block";

    const genButton = GenerationButton.describe(
      {
        id: `btn-${requestId}`,
        requestId,
        request: {
          id: requestId,
          type: "field",
          targetId: `${config.id}:${item.id}`,
        },
        label: "", // Icon only
        style: { padding: "4px" },
        dispatch, // Pass dispatch to attach callbacks immediately
      },
      state,
    ) as UIPart;

    return row({
      id: `item-row-${item.id}`,
      style: {
        "margin-bottom": "4px",
        border: "1px solid rgba(128, 128, 128, 0.1)",
        "border-radius": "4px",
        padding: "2px 4px",
        "align-items": "center",
        gap: "4px",
      },
      content: [
        textInput({
          id: `item-input-${item.id}`,
          initialValue: draftName,
          onChange: (val) => events.inputChange(props, val),
          style: { flex: 1, display: inputDisplay },
        }),
        text({
          id: `item-text-${item.id}`,
          text: item.name,
          style: { flex: 1, "font-weight": "bold", display: textDisplay },
        }),

        genButton,

        button({
          iconId: isEditing ? "save" : "edit-3",
          style: { width: "24px", padding: "4px" },
          callback: () => events.toggleEdit(props, draftName, isEditing),
        }),
        button({
          iconId: "trash",
          style: { width: "24px", padding: "4px" },
          callback: () => events.delete(props),
        }),
      ],
    });
  },

  bind(ctx, props) {
    const { useSelector, updateParts, dispatch } = ctx;
    const requestId = `gen-item-${props.item.id}`;
    GenerationButton.bind(ctx, {
      id: `btn-${requestId}`,
      requestId,
      request: {
        id: requestId,
        type: "field",
        targetId: `${props.config.id}:${props.item.id}`,
      },
      label: "",
      style: { padding: "4px" },
      dispatch,
    });

    const { item } = props;
    const itemEditKey = `item-edit-${item.id}`;

    useSelector(
      (state) => ({
        editMode: state.ui.editModes[itemEditKey],
        itemName: (
          state.story.dulfs[props.config.id as DulfsFieldID] || []
        ).find((i) => i.id === item.id)?.name,
      }),
      (slice) => {
        // If item is removed, slice.itemName might be undefined.
        if (!slice.itemName && slice.itemName !== "") return;

        const isEditing = slice.editMode;

        updateParts([
          {
            id: `item-input-${item.id}`,
            style: { display: isEditing ? "block" : "none" },
          },
          {
            id: `item-text-${item.id}`,
            style: { display: isEditing ? "none" : "block" },
            text: slice.itemName,
          },
        ]);
      },
    );
  },
};
