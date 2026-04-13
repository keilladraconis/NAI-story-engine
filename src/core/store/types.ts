import { GenerationState, MessageFactory } from "nai-gen-x";
import { Action } from "nai-store";

import { DulfsFieldID, FieldID } from "../../config/field-definitions";

// App-wide dispatch type for effects
export type AppDispatch = (action: Action) => void;

// SEGA Types
export type SegaStage =
  | "idle"
  | "lorebookContent"
  | "lorebookKeys"
  | "completed";

export interface SegaState {
  stage: SegaStage;
  statusText: string; // Current status for UI display
  activeRequestIds: string[]; // Track SEGA-initiated requests for cancellation
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

export interface StoryState {
  fields: Record<string, StoryField>;
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
    | "lorebookKeys"
    | "lorebookRefine"
    | "forge"
    | "foundation"
    | "entitySummary"
    | "entitySummaryBind"
    | "threadSummary"
    | "bootstrap";
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
    | { type: "lorebookKeys"; entryId: string }
    | { type: "lorebookRefine"; entryId: string }
    | {
        type: "forge";
        step: number;
        phase: "sketch" | "expand" | "weave";
        forgeGuidance: string;
        brainstormContext: string;
        preForgeEntityIds: string[];
      }
    | {
        type: "foundation";
        field: "shape" | "intent" | "worldState" | "attg" | "style" | "contract";
      }
    | { type: "entitySummary"; entityId: string }
    | { type: "entitySummaryBind"; entityId: string }
    | { type: "threadSummary"; groupId: string }
    | { type: "bootstrap" };
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

// World Types (v13)

export interface WorldGroup {
  id: string;
  title: string; // display name — e.g. "Thieves' Guild Inner Circle"
  summary: string; // narrative description — fed into [GROUPS] generation context
  entityIds: string[];
  lorebookEntryId?: string; // optional: group summary synced as a lorebook entry
}

export interface WorldEntity {
  id: string;
  categoryId: DulfsFieldID; // Character, Location, etc. — metadata
  lorebookEntryId?: string; // lorebook entry created on forge
  name: string;
  summary: string; // SE-internal only — editable in SeEntityEditPane, never synced to lorebook
}

export interface WorldState {
  groups: WorldGroup[];
  entitiesById: Record<string, WorldEntity>;
  entityIds: string[];
  forgeLoopActive: boolean;
}

// Foundation Types (v11)

export interface ShapeData {
  name: string; // Short label — e.g. "Slice of Life", "Tragedy"
  description: string; // Structural logic — what this shape leans toward
}

export interface IntensityData {
  level: string; // Short label — e.g. "Grounded", "Noir", "Cozy"
  description: string; // What this level means for this story concretely
}

export interface ContractData {
  required: string; // What this story MUST deliver
  prohibited: string; // What this story must NEVER do
  emphasis: string; // The specific texture that makes this story itself
}

export interface FoundationState {
  shape: ShapeData | null;
  intent: string;
  worldState: string;
  intensity: IntensityData | null;
  contract: ContractData | null;
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
