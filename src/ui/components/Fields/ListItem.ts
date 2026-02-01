import { createEvents, defineComponent } from "../../../../lib/nai-act";
import { RootState, DulfsItem } from "../../../core/store/types";
import { FieldConfig, DulfsFieldID } from "../../../config/field-definitions";
import { dulfsItemRemoved } from "../../../core/store/slices/story";
import { uiLorebookItemGenerationRequested } from "../../../core/store/slices/ui";
import { GenerationButton } from "../GenerationButton";
import { extractDulfsItemName } from "../../../core/utils/context-builder";

const { row, button, multilineTextInput } = api.v1.ui.part;

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
    const { item, config } = props;

    const bookBtnId = `book-${item.id}`;
    const contentInputId = `content-input-${item.id}`;
    const deleteBtnId = `btn-del-${item.id}`;

    return row({
      id: `item-${item.id}`,
      style: { gap: "8px", "align-items": "flex-start", padding: "4px 0" },
      content: [
        // Lorebook generation icon button
        GenerationButton.describe({
          id: bookBtnId,
          variant: "icon",
          iconId: "book",
          requestIds: [`lb-item-${item.id}-content`, `lb-item-${item.id}-keys`],
        }),
        multilineTextInput({
          id: contentInputId,
          initialValue: "",
          storageKey: `story:dulfs-item-${item.id}`,
          style: { padding: "4px", flex: "1", "min-height": "48px" },
          onChange: async (value: string) => {
            // Extract name using field-specific parser and sync to lorebook displayName only
            const name = extractDulfsItemName(value, config.id);
            await api.v1.lorebook.updateEntry(item.id, {
              displayName: name,
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
    const entryId = props.item.id;

    // Mount the lorebook icon button for reactivity
    mount(GenerationButton, {
      id: `book-${entryId}`,
      variant: "icon",
      iconId: "book",
      requestIds: [`lb-item-${entryId}-content`, `lb-item-${entryId}-keys`],
      onGenerate: () => {
        dispatch(
          uiLorebookItemGenerationRequested({
            entryId,
            contentRequestId: `lb-item-${entryId}-content`,
            keysRequestId: `lb-item-${entryId}-keys`,
          }),
        );
      },
      contentChecker: async () => {
        try {
          const entry = await api.v1.lorebook.entry(entryId);
          return !!entry?.text?.trim();
        } catch {
          return false;
        }
      },
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
