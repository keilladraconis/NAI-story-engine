import { GenerationState, MessageFactory } from "nai-gen-x";
import { Action } from "nai-store";

import { DulfsFieldID, FieldID } from "../../config/field-definitions";

// App-wide dispatch type for effects
export type AppDispatch = (action: Action) => void;

// SEGA Types
export type SegaStage =
  | "idle"
  | "canon"
  | "attgStyle"
  | "bootstrap"
  | "lorebookContent"
  | "completed";

export interface SegaState {
  stage: SegaStage;
  statusText: string; // Current status for UI display
  activeRequestIds: string[]; // Track SEGA-initiated requests for cancellation
}

export const DULFS_CATEGORIES: DulfsFieldID[] = [
  FieldID.DramatisPersonae,
  FieldID.UniverseSystems,
  FieldID.Locations,
  FieldID.Factions,
  FieldID.SituationalDynamics,
];

export interface StoryField {
  id: string;
  content: string;
  data?: Record<string, unknown>;
}

export interface DulfsItem {
  id: string;
  fieldId: DulfsFieldID;
}

export interface StoryState {
  fields: Record<string, StoryField>;
  dulfs: Record<DulfsFieldID, DulfsItem[]>;
  attgEnabled: boolean;
  styleEnabled: boolean;
}

export type BrainstormMode = "cowriter" | "critic";

export interface BrainstormMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
}

export interface BrainstormChat {
  id: string;
  title: string;
  messages: BrainstormMessage[];
  mode: BrainstormMode;
}

export interface BrainstormState {
  chats: BrainstormChat[];
  currentChatIndex: number;
  editingMessageId: string | null;
}

export interface LorebookUIState {
  selectedEntryId: string | null;
  selectedCategoryId: string | null;
}

export interface UIState {
  activeEditId: string | null;
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
  type:
  | "field"
  | "list"
  | "brainstorm"
  | "lorebookContent"
  | "lorebookKeys"
  | "lorebookRefine"
  | "bootstrap"
  | "crucibleDirection"
  | "crucibleShapeDetection"
  | "crucibleGoal"
  | "cruciblePrereqs"
  | "crucibleElements"
  | "crucibleExpansion";
  targetId: string;
  status: GenerationRequestStatus;
  prompt?: string;
}

export interface GenerationStrategy {
  requestId: string;
  messages?: Message[]; // Optional if using messageFactory
  messageFactory?: MessageFactory; // JIT strategy builder
  params?: GenerationParams; // Optional if provided by factory
  target:
  | { type: "brainstorm"; messageId: string }
  | { type: "field"; fieldId: string }
  | { type: "list"; fieldId: string }
  | { type: "lorebookContent"; entryId: string }
  | { type: "lorebookKeys"; entryId: string }
  | { type: "lorebookRefine"; entryId: string }
  | { type: "bootstrap" }
  | { type: "crucibleDirection" }
  | { type: "crucibleShapeDetection" }
  | { type: "crucibleGoal"; goalId: string }
  | { type: "cruciblePrereqs" }
  | { type: "crucibleElements" }
  | { type: "crucibleExpansion"; elementId?: string };
  prefillBehavior: "keep" | "trim";
  assistantPrefill?: string;
  continuation?: { maxCalls: number };
}

export interface RuntimeState {
  segaRunning: boolean;
  sega: SegaState;
  queue: GenerationRequest[];
  activeRequest: GenerationRequest | null;
  status: GenerationStatus;
  genx: GenerationState;
  budgetTimeRemaining: number;
}

// Crucible Types

export type CruciblePhase = "direction" | "goals" | "building" | "review";

export interface CrucibleGoal {
  id: string;
  text: string;
  why: string;
  starred: boolean;
}

export type PrereqCategory = "RELATIONSHIP" | "SECRET" | "POWER" | "HISTORY" | "OBJECT" | "BELIEF" | "PLACE";

export interface Prerequisite {
  id: string;
  element: string;
  loadBearing: string;
  category: PrereqCategory;
  satisfiedBy: string[];
}

export interface CrucibleWorldElement {
  id: string;
  fieldId: DulfsFieldID;
  name: string;
  content: string;
  want?: string;
  need?: string;
  relationship?: string;
  satisfies: string[];
}

export interface CrucibleState {
  phase: CruciblePhase;
  direction: string | null;
  detectedShape: string | null;
  merged: boolean;
  goals: CrucibleGoal[];
  prerequisites: Prerequisite[];
  elements: CrucibleWorldElement[];
}

export interface RootState {
  story: StoryState;
  brainstorm: BrainstormState;
  ui: UIState;
  runtime: RuntimeState;
  crucible: CrucibleState;
}
