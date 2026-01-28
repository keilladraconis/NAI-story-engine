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
import { generationRequested } from "../../../core/store/slices/runtime";
import { GenerationButton } from "../GenerationButton";
import {
  ItemColumn,
  IconButton,
  StyledTextInput,
  StyledTextArea,
  ContentText,
  StyledCollapsibleSection,
  Styles,
} from "../../styles";

const { row } = api.v1.ui.part;

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
    headerRow: {
      "align-items": "center",
      gap: "4px",
      "justify-content": "flex-end",
      "margin-bottom": "8px",
    },
    nameInput: { "margin-bottom": "8px" },
    genButton: { padding: "4px" },
    hidden: { display: "none" },
    block: { display: "block" },
  },

  describe(props) {
    const { item, config } = props;
    const requestId = `gen-item-${item.id}`;

    const editBtnId = `btn-edit-${item.id}`;
    const saveBtnId = `btn-save-${item.id}`;
    const deleteBtnId = `btn-del-${item.id}`;
    const nameInputId = `name-input-${item.id}`;
    const contentInputId = `content-input-${item.id}`;
    const contentTextId = `content-text-${item.id}`;
    const collapseId = `collapse-${item.id}`;

    const genButton = GenerationButton.describe({
      id: `gen-btn-${item.id}`,
      requestId,
      label: "", // Icon only
      style: this.styles?.genButton,
    }) as UIPart;

    return ItemColumn({
      id: `item-${item.id}`,
      content: [
        StyledCollapsibleSection({
          id: collapseId,
          title: item.name,
          storageKey: `story:dulfs-item-expanded-${item.id}`,
          content: [
            row({
              style: this.styles?.headerRow,
              content: [
                genButton,
                IconButton({
                  id: editBtnId,
                  iconId: "edit-3",
                  callback: () => this.events.beginEdit(props),
                }),
                IconButton({
                  id: saveBtnId,
                  iconId: "save",
                  style: { display: "none" },
                  callback: () => this.events.save(props),
                }),
                IconButton({
                  id: deleteBtnId,
                  iconId: "trash",
                  callback: () => this.events.delete(props),
                }),
              ],
            }),
            StyledTextInput({
              id: nameInputId,
              initialValue: item.name,
              placeholder: "Item Name",
              storageKey: `story:dulfs-item-name-${item.id}`,
              style: mergeStyles(this.styles?.nameInput, this.styles?.hidden),
            }),
            StyledTextArea({
              id: contentInputId,
              initialValue: item.content,
              placeholder: config.placeholder,
              storageKey: `story:dulfs-item-content-${item.id}`,
              style: { display: "none" },
            }),
            ContentText({
              id: contentTextId,
              text: item.content || "_No description._",
              markdown: true,
            }),
          ],
        }),
      ],
    });
  },

  onMount(props, ctx) {
    const { useSelector, useEffect, dispatch } = ctx;
    const { item, config } = props;

    const editBtnId = `btn-edit-${item.id}`;
    const saveBtnId = `btn-save-${item.id}`;
    const nameInputId = `name-input-${item.id}`;
    const contentInputId = `content-input-${item.id}`;
    const contentTextId = `content-text-${item.id}`;
    const collapseId = `collapse-${item.id}`;

    const nameStorageKey = `dulfs-item-name-${item.id}`;
    const contentStorageKey = `dulfs-item-content-${item.id}`;

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

    // Effect: Handle edit begin - push current content to storage
    useEffect(
      (action) =>
        action.type === uiFieldEditBegin({ id: "" }).type &&
        (action as FieldAction).payload.id === item.id,
      async (_action, { getState }) => {
        const items =
          getState().story.dulfs[config.id as DulfsFieldID] || [];
        const currentItem = items.find((i) => i.id === item.id);
        if (currentItem) {
          await api.v1.storyStorage.set(nameStorageKey, currentItem.name);
          await api.v1.storyStorage.set(contentStorageKey, currentItem.content);
        }
      },
    );

    // Effect: Handle edit end - read from storage and update state
    useEffect(
      (action) =>
        action.type === uiFieldEditEnd({ id: "" }).type &&
        (action as FieldAction).payload.id === item.id,
      async (_action, { dispatch }) => {
        const name = (await api.v1.storyStorage.get(nameStorageKey)) || item.name;
        const content =
          (await api.v1.storyStorage.get(contentStorageKey)) || item.content;

        dispatch(
          dulfsItemUpdated({
            fieldId: config.id as DulfsFieldID,
            itemId: item.id,
            updates: { name: String(name), content: String(content) },
          }),
        );
      },
    );

    // Bind Generation Button
    ctx.mount(GenerationButton, {
      id: `gen-btn-${item.id}`,
      requestId: `gen-item-${item.id}`,
      label: "",
      generateAction: generationRequested({
        id: `gen-item-${item.id}`,
        type: "field",
        targetId: `${config.id}:${item.id}`,
      }),
    });

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
            id: nameInputId,
            style: mergeStyles(
              Styles.textInput,
              mergeStyles(
                this.styles?.nameInput,
                isEditing ? this.styles?.block : this.styles?.hidden,
              ),
            ),
          },
          {
            id: contentInputId,
            style: mergeStyles(Styles.textArea, {
              display: isEditing ? "block" : "none",
            }),
          },
          {
            id: contentTextId,
            style: mergeStyles(Styles.contentText, {
              display: isEditing ? "none" : "block",
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
        api.v1.ui.updateParts([
          { id: collapseId, title: updatedItem.name },
          { id: contentTextId, text: updatedItem.content || "_No description._" },
        ]);
      },
    );
  },
});
