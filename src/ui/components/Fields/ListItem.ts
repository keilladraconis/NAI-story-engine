import { createEvents, defineComponent } from "../../../../lib/nai-act";
import { RootState, DulfsItem } from "../../../core/store/types";
import { FieldConfig, DulfsFieldID } from "../../../config/field-definitions";
import { dulfsItemRemoved } from "../../../core/store/slices/story";

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
        button({
          id: bookBtnId,
          iconId: "book",
          style: { width: "24px", padding: "4px", opacity: "0.3", cursor: "default" },
          callback: () => {},
        }),
        textInput({
          id: nameInputId,
          initialValue: "",
          storageKey: `story:dulfs-item-${item.id}`,
          style: { padding: "4px", flex: "1" },
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
