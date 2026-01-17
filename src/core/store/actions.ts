import { DulfsItem, GenerationRequest, StoryState, BrainstormMessage } from "./types";
import { DulfsFieldID } from "../../config/field-definitions";
import { action } from "./store";

// --- Action Creators ---

export const storyLoadRequested = action("story/loadRequested")();
export const storyLoaded = action("story/loaded")<{ story: StoryState }>();
export const storyCleared = action("story/cleared")();
export const settingUpdated = action("story/settingUpdated")<{
  setting: string;
}>();
export const fieldUpdated = action("story/fieldUpdated")<{
  fieldId: string;
  content: string;
  data?: unknown;
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

// Domain: Brainstorm
export const brainstormAddMessage = action("story/brainstormAddMessage")<{
  message: BrainstormMessage;
}>();
export const brainstormUpdateMessage = action("story/brainstormUpdateMessage")<{
  messageId: string;
  content: string;
}>();
export const brainstormRemoveMessage = action("story/brainstormRemoveMessage")<{
  messageId: string;
}>();
export const brainstormAppendToMessage = action("story/brainstormAppendToMessage")<{
  messageId: string;
  content: string;
}>();
export const brainstormRetry = action("story/brainstormRetry")<{
  messageId: string;
}>();

export const toggleAttg = action("story/toggleAttg")();
export const toggleStyle = action("story/toggleStyle")();

// Intent: UI
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
export const uiBrainstormSubmitUserMessage = action("ui/brainstormSubmitUserMessage")<{
  content: string;
}>();


export const segaToggled = action("runtime/segaToggled")();
// Deprecated/Legacy runtime actions? 
// Keeping generationRequested/Started/Completed for compatibility if needed, 
// but we are moving to genx/requestGeneration.
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

// Domain: GenX
export const genxRequestGeneration = action("genx/requestGeneration")<{
  requestId: string;
  messages: Message[];
  params: GenerationParams;
  target: { type: "brainstorm"; messageId: string } | { type: "field"; fieldId: string };
}>();

