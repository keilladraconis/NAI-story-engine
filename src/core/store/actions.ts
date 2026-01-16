import { Action, StoryField, DulfsItem, GenerationRequest } from "./types";
import { FieldID, DulfsFieldID } from "../../config/field-definitions";

// --- Action Types ---

export const ActionTypes = {
  // Story
  STORY_LOADED: "story/loaded",
  STORY_CLEARED: "story/cleared",
  SETTING_UPDATED: "story/settingUpdated",
  FIELD_UPDATED: "story/fieldUpdated",
  DULFS_ITEM_ADDED: "story/dulfsItemAdded",
  DULFS_ITEM_UPDATED: "story/dulfsItemUpdated",
  DULFS_ITEM_REMOVED: "story/dulfsItemRemoved",
  DULFS_SUMMARY_UPDATED: "story/dulfsSummaryUpdated",
  BRAINSTORM_MESSAGE_ADDED: "story/brainstormMessageAdded",
  BRAINSTORM_MESSAGE_EDITED: "story/brainstormMessageEdited",
  BRAINSTORM_MESSAGE_DELETED: "story/brainstormMessageDeleted",
  BRAINSTORM_RETRY: "story/brainstormRetry",
  TOGGLE_ATTG: "story/toggleAttg",
  TOGGLE_STYLE: "story/toggleStyle",

  // UI
  UI_INPUT_CHANGED: "ui/inputChanged",
  UI_SECTION_TOGGLED: "ui/sectionToggled",
  UI_EDIT_MODE_TOGGLED: "ui/editModeToggled",
  UI_LOREBOOK_SELECTED: "ui/lorebookSelected",
  UI_LOREBOOK_EDIT_MODE_TOGGLED: "ui/lorebookEditModeToggled",
  UI_CLEAR_CONFIRM_TOGGLED: "ui/clearConfirmToggled",

  // Runtime / Generation
  SEGA_TOGGLED: "runtime/segaToggled",
  GENERATION_REQUESTED: "runtime/generationRequested",
  GENERATION_STARTED: "runtime/generationStarted",
  GENERATION_COMPLETED: "runtime/generationCompleted",
  GENERATION_FAILED: "runtime/generationFailed",
  GENERATION_CANCELLED: "runtime/generationCancelled",
  BUDGET_UPDATED: "runtime/budgetUpdated",
};

// --- Action Creators ---

export const storyLoaded = (payload: any): Action => ({
  type: ActionTypes.STORY_LOADED,
  payload,
});

export const storyCleared = (): Action => ({
  type: ActionTypes.STORY_CLEARED,
  payload: null,
});

export const settingUpdated = (setting: string): Action => ({
  type: ActionTypes.SETTING_UPDATED,
  payload: { setting },
});

export const fieldUpdated = (fieldId: string, content: string, data?: any): Action => ({
  type: ActionTypes.FIELD_UPDATED,
  payload: { fieldId, content, data },
});

export const dulfsItemAdded = (fieldId: DulfsFieldID, item: DulfsItem): Action => ({
  type: ActionTypes.DULFS_ITEM_ADDED,
  payload: { fieldId, item },
});

export const dulfsItemUpdated = (fieldId: DulfsFieldID, itemId: string, updates: Partial<DulfsItem>): Action => ({
  type: ActionTypes.DULFS_ITEM_UPDATED,
  payload: { fieldId, itemId, updates },
});

export const dulfsItemRemoved = (fieldId: DulfsFieldID, itemId: string): Action => ({
  type: ActionTypes.DULFS_ITEM_REMOVED,
  payload: { fieldId, itemId },
});

export const uiInputChanged = (id: string, value: string): Action => ({
  type: ActionTypes.UI_INPUT_CHANGED,
  payload: { id, value },
});

export const uiSectionToggled = (id: string): Action => ({
  type: ActionTypes.UI_SECTION_TOGGLED,
  payload: { id },
});

export const uiEditModeToggled = (id: string): Action => ({
  type: ActionTypes.UI_EDIT_MODE_TOGGLED,
  payload: { id },
});

export const uiLorebookSelected = (entryId: string | null, categoryId: string | null): Action => ({
  type: ActionTypes.UI_LOREBOOK_SELECTED,
  payload: { entryId, categoryId },
});

export const segaToggled = (): Action => ({
  type: ActionTypes.SEGA_TOGGLED,
  payload: null,
});

export const generationRequested = (request: GenerationRequest): Action => ({
  type: ActionTypes.GENERATION_REQUESTED,
  payload: request,
});

export const generationCancelled = (requestId: string): Action => ({
  type: ActionTypes.GENERATION_CANCELLED,
  payload: { requestId },
});

export const brainstormMessageEdited = (index: number, content: string): Action => ({
  type: ActionTypes.BRAINSTORM_MESSAGE_EDITED,
  payload: { index, content },
});

export const brainstormMessageDeleted = (index: number): Action => ({
  type: ActionTypes.BRAINSTORM_MESSAGE_DELETED,
  payload: { index },
});

export const brainstormRetry = (index: number): Action => ({
  type: ActionTypes.BRAINSTORM_RETRY,
  payload: { index },
});
