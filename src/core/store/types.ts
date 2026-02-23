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
  | "crucibleGoal"
  | "crucibleChain"
  | "crucibleBuild"
  | "crucibleDirector";
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
  | { type: "crucibleGoal"; goalId: string }
  | { type: "crucibleChain"; goalId: string }
  | { type: "crucibleBuild"; goalId: string }
  | { type: "crucibleDirector" };
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

export interface CrucibleGoal {
  id: string;
  text: string;
  starred: boolean;
}

export interface CrucibleScene {
  text: string;
  constraintsResolved: string[];
  newOpenConstraints: string[];
  groundStateConstraints: string[];
  tainted?: boolean;
  favorited?: boolean;
  isOpener?: boolean;
}

export type ConstraintStatus = "open" | "resolved" | "groundState";

export interface Constraint {
  id: string;
  shortId: string; // Monotonic "X0", "X1", etc. — never renumbered
  description: string;
  sourceSceneIndex: number;
  status: ConstraintStatus;
}

export interface CrucibleChain {
  goalId: string;
  scenes: CrucibleScene[];
  openConstraints: Constraint[];
  resolvedConstraints: Constraint[];
  complete: boolean;
  nextConstraintIndex: number; // Monotonic counter for shortId assignment
  sceneBudget: number; // Max scenes per goal (synced from slider before each generation)
}

export interface CrucibleWorldElement {
  id: string;
  fieldId: DulfsFieldID;
  name: string;
  content: string;
}

export interface CrucibleBuilderState {
  elements: CrucibleWorldElement[];
  lastProcessedSceneIndex: number;
}

export interface DirectorGuidance {
  solver: string;
  builder: string;
  atSceneIndex: number; // Chain scene count when Director last ran
}

export interface CrucibleState {
  direction: string | null;
  goals: CrucibleGoal[];
  chains: Record<string, CrucibleChain>;
  activeGoalId: string | null;
  autoChaining: boolean;
  builder: CrucibleBuilderState;
  directorGuidance: DirectorGuidance | null;
}

export interface RootState {
  story: StoryState;
  brainstorm: BrainstormState;
  ui: UIState;
  runtime: RuntimeState;
  crucible: CrucibleState;
}
