import { GenerationState, MessageFactory } from "../../../lib/gen-x";

import { DulfsFieldID } from "../../config/field-definitions";

export interface StoryField {
  id: string;
  content: string;
  data?: any;
}

export interface DulfsItem {
  id: string;
  fieldId: DulfsFieldID;
}

export interface StoryState {
  fields: Record<string, StoryField>;
  dulfs: Record<DulfsFieldID, DulfsItem[]>;
  dulfsSummaries: Record<string, string>;
  attgEnabled: boolean;
  styleEnabled: boolean;
}

export interface BrainstormMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
}

export interface BrainstormState {
  messages: BrainstormMessage[];
  editingMessageId: string | null;
}

export interface LorebookUIState {
  selectedEntryId: string | null;
  selectedCategoryId: string | null;
}

export interface UIState {
  editModes: Record<string, boolean>;
  inputs: Record<string, string>;
  brainstorm: {
    input: string;
  };
  lorebook: LorebookUIState;
}

export type GenerationStatus =
  | "idle"
  | "queued"
  | "generating"
  | "paused"
  | "error";

export type GenerationRequestStatus =
  | "queued"
  | "processing"
  | "completed"
  | "cancelled";

export interface GenerationRequest {
  id: string;
  type: "field" | "list" | "brainstorm" | "lorebookContent" | "lorebookKeys";
  targetId: string;
  status: GenerationRequestStatus;
  prompt?: string;
}

export interface GenerationStrategy {
  requestId: string;
  messages?: any[]; // Optional if using messageFactory
  messageFactory?: MessageFactory; // JIT strategy builder
  params?: any; // Optional if provided by factory
  target:
    | { type: "brainstorm"; messageId: string }
    | { type: "field"; fieldId: string }
    | { type: "list"; fieldId: string }
    | { type: "lorebookContent"; entryId: string }
    | { type: "lorebookKeys"; entryId: string };
  prefixBehavior: "keep" | "trim";
  assistantPrefill?: string;
}

export interface RuntimeState {
  segaRunning: boolean;
  queue: GenerationRequest[];
  activeRequest: GenerationRequest | null;
  status: GenerationStatus;
  genx: GenerationState;
  budgetTimeRemaining: number;
}

export interface RootState {
  story: StoryState;
  brainstorm: BrainstormState;
  ui: UIState;
  runtime: RuntimeState;
}
