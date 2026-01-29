import { createEvents, defineComponent } from "../../../../lib/nai-act";
import { RootState, DulfsItem } from "../../../core/store/types";
import { FieldConfig, DulfsFieldID } from "../../../config/field-definitions";
import { dulfsItemRemoved } from "../../../core/store/slices/story";
import { IconButton, StyledTextInput } from "../../styles";

const { row } = api.v1.ui.part;

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
  },

  describe(props) {
    const { item } = props;

    const bookBtnId = `book-${item.id}`;
    const nameInputId = `name-input-${item.id}`;
    const deleteBtnId = `btn-del-${item.id}`;

    return row({
      id: `item-${item.id}`,
      style: this.styles?.itemRow,
      content: [
        // Book icon (indicates lorebook status)
        IconButton({
          id: bookBtnId,
          iconId: "book",
          style: this.styles?.bookIcon,
          callback: () => {},
        }),
        // Always-editable input synced via storageKey
        StyledTextInput({
          id: nameInputId,
          initialValue: "",
          storageKey: `story:dulfs-item-${item.id}`,
          style: { flex: "1" },
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

  onMount(_props, ctx) {
    const { dispatch } = ctx;

    // Only delete handler needed
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
