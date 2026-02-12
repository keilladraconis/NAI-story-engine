import { defineComponent } from "nai-act";
import { RootState, DulfsItem } from "../../../core/store/types";
import { FieldConfig, DulfsFieldID } from "../../../config/field-definitions";
import { dulfsItemRemoved } from "../../../core/store/slices/story";
import { uiLorebookItemGenerationRequested } from "../../../core/store/slices/ui";
import { GenerationButton } from "../GenerationButton";
import { extractDulfsItemName } from "../../../core/utils/context-builder";

const { row, button, multilineTextInput } = api.v1.ui.part;

/**
 * Calculate min-height in rem based on content length.
 * Estimates lines from newlines + character wrapping.
 */
export function contentMinHeight(content: string): string {
  if (!content) return "3rem";
  const lines = content.split("\n").reduce((total, line) => {
    return total + Math.max(1, Math.ceil(line.length / 50));
  }, 0);
  const rem = Math.min(Math.max(lines, 3), 20);
  return `${rem}rem`;
}

export const inputStyle = (minHeight: string) =>
  ({ padding: "4px", flex: "1", "min-height": minHeight }) as Record<
    string,
    string
  >;

export interface ListItemProps {
  config: FieldConfig;
  item: DulfsItem;
}

export const ListItem = defineComponent<ListItemProps, RootState>({
  id: (props) => `item-${props.item.id}`,

  build(props, ctx) {
    const { dispatch } = ctx;
    const { item, config } = props;
    const entryId = item.id;

    const bookBtnId = `book-${entryId}`;
    const contentInputId = `content-input-${entryId}`;
    const deleteBtnId = `btn-del-${entryId}`;

    // Render the lorebook icon button with full props
    const { part: bookBtnPart } = ctx.render(GenerationButton, {
      id: bookBtnId,
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
        } catch (e) {
          api.v1.log(`[ListItem] Error checking lorebook entry ${entryId}:`, e);
          return false;
        }
      },
    });

    const deleteItem = () => {
      dispatch(
        dulfsItemRemoved({
          fieldId: config.id as DulfsFieldID,
          itemId: item.id,
        }),
      );
    };

    return row({
      id: `item-${entryId}`,
      style: { gap: "8px", "align-items": "flex-start", padding: "4px 0" },
      content: [
        bookBtnPart,
        multilineTextInput({
          id: contentInputId,
          initialValue: "",
          storageKey: `story:dulfs-item-${entryId}`,
          style: inputStyle("3rem"),
          onChange: async (value: string) => {
            // Extract name using field-specific parser and sync to lorebook displayName only
            const name = extractDulfsItemName(value, config.id);
            await api.v1.lorebook.updateEntry(entryId, {
              displayName: name,
            });
            // Resize textarea to fit content
            api.v1.ui.updateParts([
              { id: contentInputId, style: inputStyle(contentMinHeight(value)) },
            ]);
          },
        }),
        button({
          id: deleteBtnId,
          iconId: "trash",
          style: { width: "24px", padding: "4px" },
          callback: deleteItem,
        }),
      ],
    });
  },
});
