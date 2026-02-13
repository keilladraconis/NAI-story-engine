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
  | "dulfsLists"
  | "lorebookContent"
  | "completed";

export interface SegaState {
  stage: SegaStage;
  statusText: string; // Current status for UI display
  activeRequestIds: string[]; // Track SEGA-initiated requests for cancellation
  dulfsRoundRobin: {
    currentIndex: number;
    passes: number; // Track complete cycles to ensure all categories have items
  };
}

export const DULFS_CATEGORIES: DulfsFieldID[] = [
  FieldID.DramatisPersonae,
  FieldID.UniverseSystems,
  FieldID.Locations,
  FieldID.Factions,
  FieldID.SituationalDynamics,
];

export const MIN_ITEMS_PER_CATEGORY = 2;

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
  type:
  | "field"
  | "list"
  | "brainstorm"
  | "lorebookContent"
  | "lorebookKeys"
  | "lorebookRefine"
  | "bootstrap"
  | "crucibleSeed"
  | "crucibleExpand";
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
  | { type: "crucibleSeed" }
  | { type: "crucibleExpand"; round: number };
  prefillBehavior: "keep" | "trim";
  assistantPrefill?: string;
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
export type CrucibleNodeKind =
  | "intent" | "beat" | "character" | "faction"
  | "location" | "system" | "situation" | "opener";

export type CrucibleNodeStatus = "pending" | "accepted" | "edited" | "rejected";
export type CrucibleNodeOrigin = "solver" | "nudge" | "user";

export type CrucibleStrategy =
  | "character-driven" | "faction-conflict" | "mystery-revelation"
  | "exploration" | "slice-of-life" | "custom";

export type CruciblePhase = "idle" | "seeding" | "expanding" | "committed";

export interface CrucibleNode {
  id: string;
  kind: CrucibleNodeKind;
  origin: CrucibleNodeOrigin;
  status: CrucibleNodeStatus;
  round: number;
  content: string;
  serves: string[];
  stale: boolean;
}

export interface CrucibleState {
  phase: CruciblePhase;
  strategy: CrucibleStrategy | null;
  nodes: CrucibleNode[];
  currentRound: number;
  windowOpen: boolean;
}

export interface RootState {
  story: StoryState;
  brainstorm: BrainstormState;
  ui: UIState;
  runtime: RuntimeState;
  crucible: CrucibleState;
}
