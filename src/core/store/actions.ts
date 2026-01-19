import {
  DulfsItem,
  GenerationRequest,
  StoryState,
  BrainstormMessage,
  GenerationStrategy,
} from "./types";
import { DulfsFieldID } from "../../config/field-definitions";
import { action } from "./store";

// --- Action Creators ---

// Domain: Story Lifecycle & Core
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
export const attgToggled = action("story/attgToggled")();
export const styleToggled = action("story/styleToggled")();

// Domain: DULFS
export const dulfsItemAdded = action("dulfs/itemAdded")<{
  fieldId: DulfsFieldID;
  item: DulfsItem;
}>();
export const dulfsItemUpdated = action("dulfs/itemUpdated")<{
  fieldId: DulfsFieldID;
  itemId: string;
  updates: Partial<DulfsItem>;
}>();
export const dulfsItemRemoved = action("dulfs/itemRemoved")<{
  fieldId: DulfsFieldID;
  itemId: string;
}>();
export const dulfsSummaryUpdated = action("dulfs/summaryUpdated")<{
  fieldId: string;
  summary: string;
}>();

// Domain: Brainstorm
export const brainstormAddMessage = action("brainstorm/messageAdded")<{
  message: BrainstormMessage;
}>();
export const brainstormUpdateMessage = action("brainstorm/messageUpdated")<{
  messageId: string;
  content: string;
}>();
export const brainstormRemoveMessage = action("brainstorm/messageRemoved")<{
  messageId: string;
}>();
export const brainstormAppendToMessage = action("brainstorm/messageAppended")<{
  messageId: string;
  content: string;
}>();
export const brainstormHistoryPruned = action("brainstorm/historyPruned")<{
  messageId: string; // The message to prune from (inclusive/exclusive logic handled in reducer)
}>();

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

// Intent: Brainstorm UI
export const uiBrainstormSubmitUserMessage = action(
  "ui/brainstormSubmitUserMessage",
)();
export const uiBrainstormEditStarted = action("ui/brainstormEditStarted")<{
  messageId: string;
}>();
export const uiBrainstormEditEnded = action("ui/brainstormEditEnded")<{
  messageId: string;
}>();
// These are Intents because they involve storage side-effects before domain updates
export const uiBrainstormEditMessage = action("ui/brainstormEditMessage")<{
  messageId: string;
  content?: string;
}>();
export const uiBrainstormSaveMessageEdit = action(
  "ui/brainstormSaveMessageEdit",
)<{
  messageId: string;
}>();
export const uiBrainstormRetry = action("ui/brainstormRetry")<{
  messageId: string;
}>();
export const uiRequestCancellation = action("ui/requestCancellation")(); // Intent to cancel current/queued generation
export const uiUserPresenceConfirmed = action("ui/userPresenceConfirmed")();

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
export const runtimeStateUpdated = action("runtime/stateUpdated")<{
  genxState: any; // We'll refine the type later or import GenerationState
}>();

// Domain: GenX
export const genxRequestGeneration = action(
  "genx/requestGeneration",
)<GenerationStrategy>();
