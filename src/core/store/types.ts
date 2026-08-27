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
    | "forgeCleanup"
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
        type: "forgeCleanup";
        chatId: string;
        messageId: string;
        discardedNames: string[];
      }
    | {
        type: "foundation";
        field:
          "shape" | "intent" | "worldState" | "attg" | "style" | "contract";
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

/** How far out a thread's terminus sits. An attribute, not three categories:
 *  arc, plot and unresolved point differ in scope and lifetime, not in kind —
 *  all three are "something is open and wants closing". Splitting them would
 *  mean three prompts, three sidebar sections and permanent arguments about
 *  whether a hidden letter is a plot or a point. One attribute drives the
 *  differences that genuinely exist: condition range, whether it gets a pacing
 *  gate, and how eagerly triage proposes retiring it. */
export type ThreadHorizon = "arc" | "plot" | "point";

/** Satisfaction is a flag flip, not a deletion — the entry is disabled rather
 *  than the model being told the plot is over. */
/** Three readings, two behaviours.
 *
 *  `satisfied` and `abandoned` are identical to every mechanism — both disable
 *  the entry (§4.4), both sort first for displacement (§4.5), both stop triage
 *  proposing the thread, and neither can expire again. The distinction is for
 *  the writer alone, and it is worth a member because the alternative was
 *  telling them a commitment was *settled* when the story had walked away from
 *  it: a check mark on a thread they never resolved, asserting something false
 *  about their own story on the surface built to be scanned. */
export type ThreadStatus = "open" | "satisfied" | "abandoned";

export interface Thread {
  id: string;
  title: string; // display name — e.g. "Thieves' Guild Inner Circle"
  /** The reminder prose injected when the thread's condition fires — not a
   *  description of a grouping. Also fed into [GROUPS] generation context. */
  text: string;
  horizon: ThreadHorizon;
  entityIds: string[]; // the cast the thread drags into context
  lorebookEntryId?: string; // optional: thread text synced as a lorebook entry
  status: ThreadStatus;
  /** The paragraph the Engine last opened or renewed this thread at, or `null`
   *  for one nobody has anchored (design §4.3, §4.5).
   *
   *  Two deferred features wanted the same missing field: the arc pacing gate
   *  ("how long since this thread last fired") and expiry ("how long since the
   *  story last touched it"). It is a paragraph INDEX rather than a timestamp
   *  because both are specified in paragraphs, and because an index compares
   *  against the branch's own paragraph count — so undo moves it correctly,
   *  which no wall clock does.
   *
   *  **`null` is not zero, and the difference is a destructive verdict.** A
   *  thread the writer creates by hand is never anchored: the dispatch is
   *  synchronous and the count needs a document scan, and a defaulted 0 would
   *  read as "abandoned since paragraph 0" — which is exactly the persisted lie
   *  `isThreadExpired`'s comment refuses to reach a verdict on. `null` says
   *  what is true, survives JSON where `undefined` would vanish from the record
   *  entirely, and leaves the count untrustworthy in the one direction that
   *  never destroys anything. */
  anchorParagraph: number | null;
}

/** A thread as a callsite hands it to `threadCreated`. `horizon` and `status`
 *  are the reducer's to default (see slices/world.ts), so no callsite — the
 *  Forge's [THREAD] command, the World's "+ New Thread", the Engine's own
 *  `open` — has to remember them, and none of them can disagree about what the
 *  default is. The Engine is the only caller that passes `anchorParagraph`,
 *  because it is the only one that knows the paragraph it is acting at. */
export type ThreadDraft = Omit<
  Thread,
  "horizon" | "status" | "anchorParagraph"
> &
  Partial<Pick<Thread, "horizon" | "status" | "anchorParagraph">>;

export type EntityLifecycle = "draft" | "live";

export interface WorldEntity {
  id: string;
  categoryId: DulfsFieldID; // Character, Location, etc. — metadata
  lorebookEntryId?: string; // lorebook entry created on Cast (live only)
  name: string;
  summary: string; // SE-internal only — editable in SeEntityEditPane, never synced to lorebook
  lifecycle: EntityLifecycle; // "draft" = no lorebook entry yet; "live" = lorebook-bound
  sourceChatId?: string; // chat session that produced this entity
  /** Id of the assistant message that most recently created or revised this entity. Set by the forge-chat completion handler; never cleared. Used by chat-types to render inline cards under the originating turn. */
  lastAffectingMessageId?: string;
}

export interface WorldState {
  threads: Thread[];
  entitiesById: Record<string, WorldEntity>;
  entityIds: string[];
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

export interface RootState {
  story: StoryState;
  chat: import("./slices/chat").ChatSliceState;
  ui: UIState;
  runtime: RuntimeState;
  world: WorldState;
  foundation: FoundationState;
  forge: import("./slices/forge").ForgeSliceState;
  /** The Engine loop's own state, mirrored from the pass machine so the HUD can
   *  subscribe. Not persisted: a pass is a moment, not a fact about the story. */
  engine: import("./slices/engine").EngineSliceState;
}
