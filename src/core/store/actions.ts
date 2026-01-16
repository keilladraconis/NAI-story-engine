import { Action, DulfsItem, GenerationRequest, StoryState } from "./types";
import { DulfsFieldID } from "../../config/field-definitions";

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
} as const;

export function action<T extends string>(type: T) {
  return <P = void>() =>
    (payload: P) =>
      ({ type, payload } as Action<T, P>);
}

// --- Action Creators ---

export const storyLoaded = action(ActionTypes.STORY_LOADED)<{ story: StoryState }>();
export const storyCleared = action(ActionTypes.STORY_CLEARED)();
export const settingUpdated = action(ActionTypes.SETTING_UPDATED)<{ setting: string }>();
export const fieldUpdated = action(ActionTypes.FIELD_UPDATED)<{
  fieldId: string;
  content: string;
  data?: any;
}>();
export const dulfsItemAdded = action(ActionTypes.DULFS_ITEM_ADDED)<{
  fieldId: DulfsFieldID;
  item: DulfsItem;
}>();
export const dulfsItemUpdated = action(ActionTypes.DULFS_ITEM_UPDATED)<{
  fieldId: DulfsFieldID;
  itemId: string;
  updates: Partial<DulfsItem>;
}>();
export const dulfsItemRemoved = action(ActionTypes.DULFS_ITEM_REMOVED)<{
  fieldId: DulfsFieldID;
  itemId: string;
}>();
export const dulfsSummaryUpdated = action(ActionTypes.DULFS_SUMMARY_UPDATED)<{
  fieldId: string;
  summary: string;
}>();
export const brainstormMessageAdded = action(ActionTypes.BRAINSTORM_MESSAGE_ADDED)<{
  role: string;
  content: string;
}>();
export const brainstormMessageEdited = action(ActionTypes.BRAINSTORM_MESSAGE_EDITED)<{
  index: number;
  content: string;
}>();
export const brainstormMessageDeleted = action(ActionTypes.BRAINSTORM_MESSAGE_DELETED)<{
  index: number;
}>();
export const brainstormRetry = action(ActionTypes.BRAINSTORM_RETRY)<{ index: number }>();
export const toggleAttg = action(ActionTypes.TOGGLE_ATTG)();
export const toggleStyle = action(ActionTypes.TOGGLE_STYLE)();

export const uiInputChanged = action(ActionTypes.UI_INPUT_CHANGED)<{ id: string; value: string }>();
export const uiSectionToggled = action(ActionTypes.UI_SECTION_TOGGLED)<{ id: string }>();
export const uiEditModeToggled = action(ActionTypes.UI_EDIT_MODE_TOGGLED)<{ id: string }>();
export const uiLorebookSelected = action(ActionTypes.UI_LOREBOOK_SELECTED)<{
  entryId: string | null;
  categoryId: string | null;
}>();
export const uiLorebookEditModeToggled = action(ActionTypes.UI_LOREBOOK_EDIT_MODE_TOGGLED)();
export const uiClearConfirmToggled = action(ActionTypes.UI_CLEAR_CONFIRM_TOGGLED)();

export const segaToggled = action(ActionTypes.SEGA_TOGGLED)();
export const generationRequested = action(ActionTypes.GENERATION_REQUESTED)<GenerationRequest>();
export const generationStarted = action(ActionTypes.GENERATION_STARTED)<{ requestId: string }>();
export const generationCompleted = action(ActionTypes.GENERATION_COMPLETED)<{ requestId: string }>();
export const generationFailed = action(ActionTypes.GENERATION_FAILED)<{
  requestId: string;
  error: string;
}>();
export const generationCancelled = action(ActionTypes.GENERATION_CANCELLED)<{ requestId: string }>();
export const budgetUpdated = action(ActionTypes.BUDGET_UPDATED)<{ timeRemaining: number }>();

export const actions = {
  storyLoaded,
  storyCleared,
  settingUpdated,
  fieldUpdated,
  dulfsItemAdded,
  dulfsItemUpdated,
  dulfsItemRemoved,
  dulfsSummaryUpdated,
  brainstormMessageAdded,
  brainstormMessageEdited,
  brainstormMessageDeleted,
  brainstormRetry,
  toggleAttg,
  toggleStyle,

  uiInputChanged,
  uiSectionToggled,
  uiEditModeToggled,
  uiLorebookSelected,
  uiLorebookEditModeToggled,
  uiClearConfirmToggled,

  segaToggled,
  generationRequested,
  generationStarted,
  generationCompleted,
  generationFailed,
  generationCancelled,
  budgetUpdated,
};