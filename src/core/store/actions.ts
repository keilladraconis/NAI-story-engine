import { DulfsItem, GenerationRequest, StoryState } from "./types";
import { DulfsFieldID } from "../../config/field-definitions";
import { action } from "./store";

// --- Action Creators ---

export const storyLoaded = action("story/loaded")<{ story: StoryState }>();
export const storyCleared = action("story/cleared")();
export const settingUpdated = action("story/settingUpdated")<{
  setting: string;
}>();
export const fieldUpdated = action("story/fieldUpdated")<{
  fieldId: string;
  content: string;
  data?: any;
}>();
export const dulfsItemAdded = action("story/dulfsItemAdded")<{
  fieldId: DulfsFieldID;
  item: DulfsItem;
}>();
export const dulfsItemUpdated = action("story/dulfsItemUpdated")<{
  fieldId: DulfsFieldID;
  itemId: string;
  updates: Partial<DulfsItem>;
}>();
export const dulfsItemRemoved = action("story/dulfsItemRemoved")<{
  fieldId: DulfsFieldID;
  itemId: string;
}>();
export const dulfsSummaryUpdated = action("story/dulfsSummaryUpdated")<{
  fieldId: string;
  summary: string;
}>();
export const brainstormMessageAdded = action("story/brainstormMessageAdded")<{
  role: string;
  content: string;
}>();
export const brainstormMessageEdited = action("story/brainstormMessageEdited")<{
  index: number;
  content: string;
}>();
export const brainstormMessageDeleted = action(
  "story/brainstormMessageDeleted",
)<{
  index: number;
}>();
export const brainstormRetry = action("story/brainstormRetry")<{
  index: number;
}>();
export const toggleAttg = action("story/toggleAttg")();
export const toggleStyle = action("story/toggleStyle")();

export const uiInputChanged = action("ui/inputChanged")<{
  id: string;
  value: string;
}>();
export const uiSectionToggled = action("ui/sectionToggled")<{ id: string }>();
export const uiEditModeToggled = action("ui/editModeToggled")<{ id: string }>();
export const uiLorebookSelected = action("ui/lorebookSelected")<{
  entryId: string | null;
  categoryId: string | null;
}>();
export const uiLorebookEditModeToggled = action("ui/lorebookEditModeToggled")();
export const uiClearConfirmToggled = action("ui/clearConfirmToggled")();

export const segaToggled = action("runtime/segaToggled")();
export const generationRequested = action(
  "runtime/generationRequested",
)<GenerationRequest>();
export const generationStarted = action("runtime/generationStarted")<{
  requestId: string;
}>();
export const generationCompleted = action("runtime/generationCompleted")<{
  requestId: string;
}>();
export const generationFailed = action("runtime/generationFailed")<{
  requestId: string;
  error: string;
}>();
export const generationCancelled = action("runtime/generationCancelled")<{
  requestId: string;
}>();
export const budgetUpdated = action("runtime/budgetUpdated")<{
  timeRemaining: number;
}>();

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
