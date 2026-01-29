import { GenerationState } from "../../../lib/gen-x";

import { DulfsFieldID } from "../../config/field-definitions";

export interface StoryField {
  id: string;
  content: string;
  data?: any;
}

export interface DulfsItem {
  id: string;
  fieldId: DulfsFieldID;
  lorebookEntryId?: string;
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

export interface UIState {
  showClearConfirm: boolean;
  editModes: Record<string, boolean>;
  inputs: Record<string, string>;
  brainstorm: {
    input: string;
  };
}

export type GenerationStatus =
  | "idle"
  | "queued"
  | "generating"
  | "paused"
  | "error";

export interface GenerationRequest {
  id: string;
  type: "field" | "list" | "brainstorm";
  targetId: string;
  prompt?: string;
}

export interface GenerationStrategy {
  requestId: string;
  messages: any[]; // TODO: Define Message type properly
  params: any; // TODO: Define Params
  target:
    | { type: "brainstorm"; messageId: string }
    | { type: "field"; fieldId: string }
    | { type: "list"; fieldId: string };
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
