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
  | "lorebookRelationalMap"
  | "lorebookRelationalMapReconcile"
  | "lorebookKeys"
  | "completed";

export interface SegaState {
  stage: SegaStage;
  statusText: string; // Current status for UI display
  activeRequestIds: string[]; // Track SEGA-initiated requests for cancellation
  relationalMaps: Record<string, string>; // entryId → map text, ephemeral (cleared on reset)
  relmapsCompleted: Record<string, boolean>; // entryId → true when relmap generated (cleared on reset)
  keysCompleted: Record<string, boolean>; // entryId → true when keys generated (cleared on reset)
}

export const WORLD_ENTRY_CATEGORIES: DulfsFieldID[] = [
  FieldID.DramatisPersonae,
  FieldID.UniverseSystems,
  FieldID.Locations,
  FieldID.Factions,
  FieldID.SituationalDynamics,
  FieldID.Topics,
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
  | "brainstormChatTitle"
  | "lorebookContent"
  | "lorebookRelationalMap"
  | "lorebookKeys"
  | "lorebookRefine"
  | "bootstrap"
  | "forge";
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
  | { type: "brainstormChatTitle"; chatIndex: number }
  | { type: "field"; fieldId: string }
  | { type: "list"; fieldId: string }
  | { type: "lorebookContent"; entryId: string }
  | { type: "lorebookRelationalMap"; entryId: string }
  | { type: "lorebookKeys"; entryId: string }
  | { type: "lorebookRefine"; entryId: string }
  | { type: "bootstrap" }
  | { type: "forge"; batchId: string };
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

// World Types (v11)

export type EntityLifecycle = "draft" | "live";

export interface WorldBatch {
  id: string;
  name: string;       // "Main", "Rusty Anchor Regulars", etc.
  entityIds: string[]; // ordered
}

export interface Relationship {
  id: string;
  fromEntityId: string;
  toEntityId: string;
  description: string;
}

export interface WorldEntity {
  id: string;
  batchId: string;
  categoryId: DulfsFieldID; // Character, Location, etc. — metadata
  lifecycle: EntityLifecycle;
  lorebookEntryId?: string; // set on Cast, cleared on Reforge
  name: string;
  summary: string; // engine-derived, read-only display
}

export interface WorldState {
  batches: WorldBatch[];
  entities: WorldEntity[];
  relationships: Relationship[];
}

// Foundation Types (v11)

export interface Tension {
  id: string;
  text: string;
  resolved: boolean;
}

export interface FoundationState {
  shape: string;
  intent: string;
  worldState: string;
  tensions: Tension[];
  attg: string;
  style: string;
  attgSyncEnabled: boolean;
  styleSyncEnabled: boolean;
}

// Crucible Types

export type CruciblePhase = "direction" | "tensions" | "building";

export interface CrucibleTension {
  id: string;
  text: string;
  accepted: boolean;
}

export interface CrucibleLink {
  id: string;
  fromName: string;
  toName: string;
  description: string;
}

export interface CrucibleBuildPass {
  passNumber: number;
  commandLog: string[];
  guidance: string;
}

export interface CrucibleWorldElement {
  id: string;
  fieldId: DulfsFieldID;
  name: string;
  content: string;
}

export interface CrucibleState {
  phase: CruciblePhase;
  direction: string | null;
  shape: { name: string; instruction: string } | null;
  cast: boolean;
  tensions: CrucibleTension[];
  elements: CrucibleWorldElement[];
  links: CrucibleLink[];
  passes: CrucibleBuildPass[];
  activeCritique: string | null;
}

export interface RootState {
  story: StoryState;
  brainstorm: BrainstormState;
  ui: UIState;
  runtime: RuntimeState;
  crucible: CrucibleState;
  world: WorldState;
  foundation: FoundationState;
}
