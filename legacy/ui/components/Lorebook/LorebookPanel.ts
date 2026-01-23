import { Component } from "../../../../lib/nai-act";
import { RootState, DulfsItem } from "../../../core/store/types";
import { DulfsFieldID } from "../../../config/field-definitions";
import {
  uiEditModeToggled,
  uiInputChanged,
  dulfsItemUpdated
} from "../../../core/store/actions";
import { GenerationButton } from "../GenerationButton";
import { createToggleableContent, createHeaderWithToggle } from "../../ui-components";

const { column, text } = api.v1.ui.part;
const { lorebookPanel } = api.v1.ui.extension;

export const LorebookPanel: Component<{}, RootState> = {
    id: () => "kse-lorebook-panel",

    describe(_props, state) {
        if (!state) return lorebookPanel({ id: "kse-lorebook-panel", name: "Story Engine", content: [] });

        const entryId = state.ui.selectedLorebookEntryId;
        let content: UIPart[] = [];

        if (entryId) {
            // Find Item
            let foundItem: DulfsItem | null = null;
            let foundFieldId: DulfsFieldID | null = null;

            for (const fid of Object.keys(state.story.dulfs)) {
                const list = state.story.dulfs[fid as DulfsFieldID];
                const item = list.find((i) => i.lorebookEntryId === entryId);
                if (item) {
                    foundItem = item;
                    foundFieldId = fid as DulfsFieldID;
                    break;
                }
            }

            if (foundItem && foundFieldId) {
                const isEditing = state.ui.lorebookEditMode;
                const itemContent = foundItem.content || "";
                const draftKey = `lorebook-draft-${entryId}`;
                const draft = state.ui.inputs[draftKey] !== undefined ? state.ui.inputs[draftKey] : itemContent;
                const requestId = `gen-lore-${entryId}`;

                const genButton = GenerationButton.describe({
                    id: `btn-${requestId}`,
                    requestId,
                    request: {
                        id: requestId,
                        type: "field",
                        targetId: `${foundFieldId}:${foundItem!.id}`
                    },
                    label: "Generate"
                }, state) as UIPart;

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
                                dulfsItemUpdated({
                                    fieldId: foundFieldId as DulfsFieldID,
                                    itemId: foundItem!.id,
                                    updates: { content: draft }
                                });
                            } else {
                                uiInputChanged({ id: draftKey, value: itemContent });
                            }
                            uiEditModeToggled({ id: `lorebook:${entryId}` });
                          },
                          genButton
                        ),
                        createToggleableContent(
                          isEditing,
                          isEditing ? draft : itemContent,
                          "Lorebook text...",
                          `lb-input-${entryId}`,
                          (val) => uiInputChanged({ id: draftKey, value: val }),
                          { "min-height": "300px" },
                          `text-display-lore-${entryId}` // Preserve ID for streaming
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
    },

    bind({ useSelector }, props) {
        useSelector(
            state => ({
                entryId: state.ui.selectedLorebookEntryId,
                // We bind to the whole dulfs structure + UI inputs relevant to lorebook
                // This is a bit coarse but safe.
                // Optimization: could refine.
                dulfs: state.story.dulfs,
                editMode: state.ui.lorebookEditMode,
                inputs: state.ui.inputs,
                
                activeId: state.runtime.activeRequest?.id,
                queueIds: state.runtime.queue.map(q => q.id),
                genx: state.runtime.genx
            }),
            (slice) => {
                const partialState = {
                    ui: {
                        selectedLorebookEntryId: slice.entryId,
                        lorebookEditMode: slice.editMode,
                        inputs: slice.inputs
                    },
                    story: {
                        dulfs: slice.dulfs
                    },
                    runtime: {
                         activeRequest: slice.activeId ? { id: slice.activeId } : null,
                         queue: slice.queueIds.map(id => ({ id })),
                         genx: slice.genx
                    }
                } as RootState;

                // Extensions must be updated via api.v1.ui.update, not updateParts
                const ext = LorebookPanel.describe(props, partialState);
                if (ext && ext.id) {
                     api.v1.ui.update([ext as UIExtension & { id: string }]);
                }
            }
        );
    }
};
