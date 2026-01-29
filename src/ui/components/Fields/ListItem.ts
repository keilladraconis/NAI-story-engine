import {
  createEvents,
  mergeStyles,
  defineComponent,
} from "../../../../lib/nai-act";
import { RootState, DulfsItem } from "../../../core/store/types";
import { FieldConfig, DulfsFieldID } from "../../../config/field-definitions";
import {
  dulfsItemUpdated,
  dulfsItemRemoved,
} from "../../../core/store/slices/story";
import {
  uiFieldEditBegin,
  uiFieldEditEnd,
} from "../../../core/store/slices/ui";
import { IconButton, StyledTextInput, Styles } from "../../styles";

const { row, text } = api.v1.ui.part;

export interface ListItemProps {
  config: FieldConfig;
  item: DulfsItem;
}

type ListItemEvents = {
  beginEdit(): void;
  save(): void;
  delete(): void;
};

export const ListItem = defineComponent<
  ListItemProps,
  RootState,
  ReturnType<typeof createEvents<ListItemProps, ListItemEvents>>
>({
  id: (props) => `item-${props.item.id}`,
  events: createEvents<ListItemProps, ListItemEvents>(),

  styles: {
    itemRow: {
      gap: "8px",
      "align-items": "center",
      padding: "4px 0",
    },
    bookIcon: {
      opacity: "0.3",
      cursor: "default",
    },
    nameText: {
      flex: "1",
      "min-width": "0",
    },
    nameInput: {
      flex: "1",
      display: "none",
    },
    hidden: { display: "none" },
    block: { display: "block" },
  },

  describe(props) {
    const { item } = props;

    const bookBtnId = `book-${item.id}`;
    const nameTextId = `name-text-${item.id}`;
    const nameInputId = `name-input-${item.id}`;
    const editBtnId = `btn-edit-${item.id}`;
    const saveBtnId = `btn-save-${item.id}`;
    const deleteBtnId = `btn-del-${item.id}`;

    return row({
      id: `item-${item.id}`,
      style: this.styles?.itemRow,
      content: [
        // Book icon (dummy, indicates lorebook status)
        IconButton({
          id: bookBtnId,
          iconId: "book",
          style: this.styles?.bookIcon,
          callback: () => {},
        }),
        // Name display
        text({
          id: nameTextId,
          text: item.name,
          style: this.styles?.nameText,
        }),
        // Name input (hidden by default)
        StyledTextInput({
          id: nameInputId,
          initialValue: item.name,
          storageKey: `story:dulfs-item-name-${item.id}`,
          style: this.styles?.nameInput,
        }),
        // Edit button
        IconButton({
          id: editBtnId,
          iconId: "edit-3",
          callback: () => this.events.beginEdit(props),
        }),
        // Save button (hidden by default)
        IconButton({
          id: saveBtnId,
          iconId: "save",
          style: { display: "none" },
          callback: () => this.events.save(props),
        }),
        // Delete button
        IconButton({
          id: deleteBtnId,
          iconId: "trash",
          callback: () => this.events.delete(props),
        }),
      ],
    });
  },

  onMount(props, ctx) {
    const { useSelector, useEffect, dispatch } = ctx;
    const { item, config } = props;

    const nameTextId = `name-text-${item.id}`;
    const nameInputId = `name-input-${item.id}`;
    const editBtnId = `btn-edit-${item.id}`;
    const saveBtnId = `btn-save-${item.id}`;

    const nameStorageKey = `dulfs-item-name-${item.id}`;

    // Event handlers only dispatch actions
    this.events.attach({
      beginEdit: (eventProps) => {
        dispatch(uiFieldEditBegin({ id: eventProps.item.id }));
      },
      save: (eventProps) => {
        dispatch(uiFieldEditEnd({ id: eventProps.item.id }));
      },
      delete: (eventProps) => {
        dispatch(
          dulfsItemRemoved({
            fieldId: eventProps.config.id as DulfsFieldID,
            itemId: eventProps.item.id,
          }),
        );
      },
    });

    type FieldAction = { type: string; payload: { id: string } };

    // Effect: Handle edit begin - push current name to storage
    useEffect(
      (action) =>
        action.type === uiFieldEditBegin({ id: "" }).type &&
        (action as FieldAction).payload.id === item.id,
      async (_action, { getState }) => {
        const items = getState().story.dulfs[config.id as DulfsFieldID] || [];
        const currentItem = items.find((i) => i.id === item.id);
        if (currentItem) {
          await api.v1.storyStorage.set(nameStorageKey, currentItem.name);
        }
      },
    );

    // Effect: Handle edit end - read from storage and update state
    useEffect(
      (action) =>
        action.type === uiFieldEditEnd({ id: "" }).type &&
        (action as FieldAction).payload.id === item.id,
      async (_action, { dispatch }) => {
        const name =
          (await api.v1.storyStorage.get(nameStorageKey)) || item.name;

        dispatch(
          dulfsItemUpdated({
            fieldId: config.id as DulfsFieldID,
            itemId: item.id,
            updates: { name: String(name) },
          }),
        );
      },
    );

    // React to Edit Mode
    useSelector(
      (state) => state.ui.editModes[item.id],
      (isEditing) => {
        api.v1.ui.updateParts([
          {
            id: editBtnId,
            style: mergeStyles(Styles.iconButton, {
              display: isEditing ? "none" : "block",
            }),
          },
          {
            id: saveBtnId,
            style: mergeStyles(Styles.iconButton, {
              display: isEditing ? "block" : "none",
            }),
          },
          {
            id: nameTextId,
            style: mergeStyles(this.styles?.nameText, {
              display: isEditing ? "none" : "block",
            }),
          },
          {
            id: nameInputId,
            style: mergeStyles(Styles.textInput, {
              flex: "1",
              display: isEditing ? "block" : "none",
            }),
          },
        ]);
      },
    );

    // Sync State -> Display
    useSelector(
      (state) =>
        (state.story.dulfs[config.id as DulfsFieldID] || []).find(
          (i) => i.id === item.id,
        ),
      (updatedItem) => {
        if (!updatedItem) return;
        api.v1.ui.updateParts([{ id: nameTextId, text: updatedItem.name }]);
      },
    );
  },
});
