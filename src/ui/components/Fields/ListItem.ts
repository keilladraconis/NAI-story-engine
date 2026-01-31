import { createEvents, defineComponent } from "../../../../lib/nai-act";
import { RootState, DulfsItem } from "../../../core/store/types";
import { FieldConfig, DulfsFieldID } from "../../../config/field-definitions";
import { dulfsItemRemoved } from "../../../core/store/slices/story";
import { LorebookIconButton } from "../LorebookIconButton";

const { row, button, textInput } = api.v1.ui.part;

export interface ListItemProps {
  config: FieldConfig;
  item: DulfsItem;
}

type ListItemEvents = {
  delete(): void;
};

export const ListItem = defineComponent<
  ListItemProps,
  RootState,
  ReturnType<typeof createEvents<ListItemProps, ListItemEvents>>
>({
  id: (props) => `item-${props.item.id}`,
  events: createEvents<ListItemProps, ListItemEvents>(),

  describe(props) {
    const { item } = props;

    const bookBtnId = `book-${item.id}`;
    const nameInputId = `name-input-${item.id}`;
    const deleteBtnId = `btn-del-${item.id}`;

    return row({
      id: `item-${item.id}`,
      style: { gap: "8px", "align-items": "center", padding: "4px 0" },
      content: [
        // Lorebook generation icon button
        LorebookIconButton.describe({
          id: bookBtnId,
          entryId: item.id,
        }),
        textInput({
          id: nameInputId,
          initialValue: "",
          storageKey: `story:dulfs-item-${item.id}`,
          style: { padding: "4px", flex: "1" },
          onChange: async (value: string) => {
            await api.v1.lorebook.updateEntry(item.id, {
              displayName: value,
              keys: [value],
            });
          },
        }),
        button({
          id: deleteBtnId,
          iconId: "trash",
          style: { width: "24px", padding: "4px" },
          callback: () => this.events.delete(props),
        }),
      ],
    });
  },

  onMount(props, ctx) {
    const { dispatch, mount } = ctx;

    // Mount the lorebook icon button for reactivity
    mount(LorebookIconButton, {
      id: `book-${props.item.id}`,
      entryId: props.item.id,
    });

    // Delete handler
    this.events.attach({
      delete: (eventProps) => {
        dispatch(
          dulfsItemRemoved({
            fieldId: eventProps.config.id as DulfsFieldID,
            itemId: eventProps.item.id,
          }),
        );
      },
    });
  },
});
