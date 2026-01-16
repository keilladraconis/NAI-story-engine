import { RootState } from "../../core/store/types";
import { dispatch } from "../../core/store";
import {
  uiEditModeToggled,
  fieldUpdated,
  uiInputChanged,
  generationRequested,
  generationCancelled,
  dulfsItemUpdated,
} from "../../core/store/actions";
import {
  createHeaderWithToggle,
  createToggleableContent,
  createResponsiveGenerateButton,
} from "../ui-components";
import { DulfsFieldID } from "../../config/field-definitions";

const { row, column, text } = api.v1.ui.part;
const { lorebookPanel } = api.v1.ui.extension;

export const renderLorebookPanel = (
  state: RootState,
): UIExtensionLorebookPanel => {
  const entryId = state.ui.selectedLorebookEntryId;
  let content: UIPart[] = [];

  if (entryId) {
    // Find matching DULFS item
    // Scan all lists
    let foundItem = null;
    let foundFieldId: DulfsFieldID | null = null;

    for (const fid of Object.keys(state.story.dulfs)) {
      const list = state.story.dulfs[fid as DulfsFieldID];
      // Since we don't store lorebook link directly in DulfsItem explicitly in types yet (I added it but logic isn't fully there),
      // or we might check name match?
      // Re-checking types.ts: `lorebookEntryId` is in DulfsItem.
      const item = list.find((i) => i.lorebookEntryId === entryId);
      if (item) {
        foundItem = item;
        foundFieldId = fid as DulfsFieldID;
        break;
      }
    }

    if (foundItem && foundFieldId) {
      const isEditing = state.ui.lorebookEditMode;
      const itemContent = foundItem.content || ""; // Or foundItem.text if we separate generated description from full text
      // For now assuming content is what we edit.

      const draftKey = `lorebook-draft-${entryId}`;
      const draft =
        state.ui.inputs[draftKey] !== undefined
          ? state.ui.inputs[draftKey]
          : itemContent;

      const genId = `gen-lore-${entryId}`;
      const isGenerating =
        state.runtime.activeRequest?.id === genId ||
        state.runtime.queue.some((r) => r.id === genId);

      content = [
        column({
          style: { padding: "8px", gap: "12px" },
          content: [
            column({
              content: [
                text({
                  text: `Source: ${foundItem.name}`,
                  style: { "font-weight": "bold", opacity: 0.8 },
                }),
                text({
                  text: foundItem.content,
                  style: { "font-style": "italic", "font-size": "0.9em" },
                }),
              ],
              style: { "margin-bottom": "8px" },
            }),
            createHeaderWithToggle(
              "Entry Content",
              isEditing,
              () => {
                if (isEditing) {
                  // Save back to DULFS item? Or to Lorebook directly?
                  // Original logic: update DULFS item content.
                  // We need an action for that.
                  // Actually, if it's linked, we probably want to update the DULFS item 'content' or 'text'.
                  // Let's assume we update 'content' for now.
                  dispatch(
                    dulfsItemUpdated({
                      fieldId: foundFieldId as DulfsFieldID,
                      itemId: foundItem!.id,
                      updates: { content: draft },
                    }),
                  );
                } else {
                  dispatch(
                    uiInputChanged({ id: draftKey, value: itemContent }),
                  );
                }
                dispatch(uiEditModeToggled({ id: `lorebook:${entryId}` }));
              },
              createResponsiveGenerateButton(
                `btn-${genId}`,
                { isRunning: isGenerating },
                {
                  onStart: () =>
                    dispatch(
                      generationRequested({
                        id: genId,
                        type: "field",
                        targetId: `${foundFieldId}:${foundItem!.id}`,
                      }),
                    ),
                  onCancel: () =>
                    dispatch(generationCancelled({ requestId: genId })),
                },
                "Generate",
              ),
            ),
            createToggleableContent(
              isEditing,
              isEditing ? draft : itemContent,
              "Lorebook text...",
              `lb-input-${entryId}`,
              (val) => dispatch(uiInputChanged({ id: draftKey, value: val })),
              { "min-height": "300px" },
            ),
          ],
        }),
      ];
    } else {
      content = [
        column({
          style: { padding: "16px", "text-align": "center", opacity: 0.6 },
          content: [
            text({ text: "This entry is not managed by Story Engine." }),
          ],
        }),
      ];
    }
  } else {
    content = [
      column({
        style: { padding: "16px", "text-align": "center", opacity: 0.6 },
        content: [text({ text: "Select an entry in the Lorebook to begin." })],
      }),
    ];
  }

  return lorebookPanel({
    id: "kse-lorebook-panel",
    name: "Story Engine",
    iconId: "zap",
    content,
  });
};
