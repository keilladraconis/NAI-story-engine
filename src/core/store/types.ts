import { DulfsFieldID } from "../../config/field-definitions";
import { GenerationState } from "../../../lib/gen-x";

// --- Story Domain State ---

export interface BrainstormMessage {
  id: string;
  role: string;
  content: string;
}

export interface StoryField {
  id: string;
  content: string;
  data?: any; // For brainstorm messages, etc.
}

export interface DulfsItem {
  id: string; // UUID
  fieldId: DulfsFieldID;
  name: string;
  content: string; // The generated description
  text?: string; // The expanded content (Phase 2)
  lorebookEntryId?: string; // Linked NAI lorebook entry
}

export interface StoryState {
  setting: string;
  fields: Record<string, StoryField>; // Keyed by FieldID
  dulfs: Record<DulfsFieldID, DulfsItem[]>; // Keyed by FieldID

  // Metadata for integration
  dulfsSummaries: Record<string, string>;

  // Flags for sync/generation
  attgEnabled: boolean;
  styleEnabled: boolean;
}

// --- UI Domain State ---

export interface UIState {
  // Navigation
  activeTab: string;
  sidebarOpen: boolean;

  // Lorebook Panel
  selectedLorebookEntryId: string | null;
  selectedLorebookCategoryId: string | null;
  lorebookEditMode: boolean;

  // Editor
  collapsedSections: Record<string, boolean>; // FieldID -> boolean
  editModes: Record<string, boolean>; // FieldID -> boolean
  brainstormEditingMessageId: string | null;

  // Transient Inputs (keyed by stable UI ID)
  inputs: Record<string, string>;

  // Modals/Confirms
  showClearConfirm: boolean;
}

// --- Runtime/Workflow Domain State ---

export type GenerationStatus =
  | "idle"
  | "queued"
  | "generating"
  | "paused"
  | "error";

export interface GenerationRequest {
  id: string;
  type: "field" | "list" | "brainstorm";
  targetId: string; // FieldID or DulfsItemID
  prompt?: string;
}

export interface RuntimeState {
  // SEGA Service State
  segaRunning: boolean;

  // Generation Queue
  queue: GenerationRequest[];
  activeRequest: GenerationRequest | null;
  status: GenerationStatus;

  // GenX State Reflection
  genx: GenerationState;

  // Budget
  budgetTimeRemaining: number;
}

// --- Root State ---

export interface RootState {
  story: StoryState;
  ui: UIState;
  runtime: RuntimeState;
}
