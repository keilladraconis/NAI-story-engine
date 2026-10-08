import { GenerationState, MessageFactory } from "nai-gen-x";
import { Action } from "nai-store";

import { DulfsFieldID, FieldID } from "../../config/field-definitions";

// App-wide dispatch type for effects
export type AppDispatch = (action: Action) => void;

// SEGA Types
export type SegaStage =
  "idle" | "lorebookContent" | "lorebookKeys" | "completed";

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
}

export interface LorebookUIState {
  selectedEntryId: string | null;
  selectedCategoryId: string | null;
}

export interface UIState {
  activeEditId: string | null;
  inputs: Record<string, string>;
  lorebook: LorebookUIState;
  worldExpanded: boolean | null;
  // null = the writer has not touched the Foundation toggle, so it follows the
  // flow (collapsed until a brainstorm has content). Once set it is theirs.
  foundationExpanded: boolean | null;
  // The Import wizard is shown over the Setup tab. Store-driven so the
  // cold-start bootstrap can open it once on first run (foundation empty +
  // existing unmanaged content to pull in).
  importWizardOpen: boolean;
}

export type GenerationStatus =
  "idle" | "queued" | "generating" | "paused" | "error";

export type GenerationRequestStatus =
  "queued" | "processing" | "completed" | "cancelled";

export interface GenerationRequest {
  id: string;
  type:
    | "list"
    | "chat"
    | "chatRefine"
    | "lorebookContent"
    | "lorebookKeys"
    | "forgeChat"
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
    | { type: "chat"; chatId: string; messageId: string }
    | { type: "chatRefine"; chatId: string; messageId: string; fieldId: string }
    | { type: "list"; fieldId: string }
    | { type: "lorebookContent"; entryId: string }
    | { type: "lorebookKeys"; entryId: string }
    | {
        type: "forgeChat";
        chatId: string;
        messageId: string;
      }
    | {
        type: "foundation";
        field: "situation" | "worldState" | "attg" | "style" | "contract";
      }
    | { type: "entitySummary"; entityId: string }
    | { type: "entitySummaryBind"; entityId: string }
    | { type: "threadSummary"; threadId: string }
    | { type: "bootstrap" };
  prefillBehavior: "keep" | "trim";
  assistantPrefill?: string;
  continuation?: { maxCalls: number };
  minResponseLength?: number;
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

/** A Thread is open while a later scene can still move it, and concluded once
 *  its state has become a permanent fact written into its cast's own entries.
 *  Concluding disables the Thread's lorebook entry; it deletes nothing. */
export type ThreadStatus = "open" | "concluded";

/** The standing state of an arc or relationship between known entities.
 *
 *  Three texts with different readers. `state` is what is true now, and it is
 *  the Thread's lorebook entry text — the story model reads it whenever the
 *  cast is on stage. `latent` is what is true now and unspoken, owed or
 *  concealed, and it never leaves Story Engine: a model shown that something
 *  has not happened writes it happening. `wish` is what the writer wants to
 *  come about. It is not a fact, so it is never folded into anything on
 *  conclusion, and no generation reads it. */
export interface Thread {
  id: string;
  title: string;
  state: string;
  latent: string;
  wish: string;
  entityIds: string[];
  lorebookEntryId?: string;
  status: ThreadStatus;
}

/** A Thread as a callsite hands it to `threadCreated`. `status`, `latent` and
 *  `wish` are the reducer's to default, so no creator has to remember them. */
export type ThreadDraft = Omit<Thread, "status" | "latent" | "wish"> &
  Partial<Pick<Thread, "status" | "latent" | "wish">>;

/** "draft": made by the World's "+ Add Entity" and not yet saved, so it has no
 *  lorebook entry. "live": bound to one. A Scenario Build CREATE is live at
 *  once; a draft becomes live when the edit pane saves it. */
export type EntityLifecycle = "draft" | "live";

export interface WorldEntity {
  id: string;
  categoryId: DulfsFieldID; // Character, Location, etc. — metadata
  lorebookEntryId?: string; // the entry a live entity is bound to; a draft has none
  name: string;
  summary: string; // SE-internal only — editable in SeEntityEditPane, never synced to lorebook
  lifecycle: EntityLifecycle;
  sourceChatId?: string; // set when a Scenario chat built this entity; what permits a Build DELETE
}

export interface WorldState {
  threads: Thread[];
  entitiesById: Record<string, WorldEntity>;
  entityIds: string[];
}

// Foundation Types (v11)

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
  situation: string;
  worldState: string;
  intensity: IntensityData | null;
  contract: ContractData | null;
  attg: string;
  style: string;
  attgSyncEnabled: boolean;
  styleSyncEnabled: boolean;
}

export interface RootState {
  story: StoryState;
  chat: import("./slices/chat").ChatSliceState;
  ui: UIState;
  runtime: RuntimeState;
  world: WorldState;
  foundation: FoundationState;
  /** The Engine loop's own state, mirrored from the pass machine so the HUD can
   *  subscribe. Not persisted: a pass is a moment, not a fact about the story. */
  engine: import("./slices/engine").EngineSliceState;
}
