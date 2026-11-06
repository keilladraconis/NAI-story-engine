import type { GenerationState } from "nai-gen-x";

// ── Canon ────────────────────────────────────────────────────────────────────

export type StageId =
  "talk" | "brief" | "vignettes" | "now" | "canon" | "cast" | "distill";

export interface Brief {
  title: string;
  /** Genre and tags, as they would read in an ATTG line. */
  genre: string;
  /** Who, where, and the pressure the story lives inside, in as much depth as the talk gave. */
  premise: string;
  /** What the story should dwell on: core focus, dynamics, scenes the world must allow. */
  desires: string;
  /** How the world works: its rules, tone, and what kind of beings live in it. */
  world: string;
  /** Narrative perspective and tense, e.g. "Third limited, past". */
  voice: string;
  heat: string;
  pace: string;
  /** Hard and soft limits, as the writer put them. */
  limits: string;
  /** Author's notes: families, details, decisions, anything else. */
  notes: string;
}

export interface Vignette {
  id: string;
  title: string;
  text: string;
}

export interface StartingPoint {
  /** What is true at the story's first message. */
  now: string;
  /** What the vignettes show that must be earned through play. */
  notYet: string;
}

export type DocKind =
  | "geography"
  | "history"
  | "culture"
  | "tensions"
  | "factions"
  | "locations"
  | "relationships"
  | "plots"
  | "system"
  | "dossier";

export type IssueKind =
  | "contradiction"
  | "past-the-now"
  | "invented"
  | "name-collision"
  | "missing-family"
  | "limit";

export interface Issue {
  id: string;
  kind: IssueKind;
  text: string;
}

export interface Review {
  issues: Issue[];
  /** hashText of the document text the review read. */
  textHash: string;
}

export interface CanonDoc {
  id: string;
  kind: DocKind;
  /** A dossier's title is the character's name. */
  title: string;
  text: string;
  review?: Review;
}

export interface CanonState {
  brief: Brief;
  vignettes: Vignette[];
  startingPoint: StartingPoint;
  docs: CanonDoc[];
  castReviewed: boolean;
}

// ── Workshop ─────────────────────────────────────────────────────────────────

export type Target =
  | { kind: "vignette" }
  | { kind: "startingPoint" }
  | { kind: "doc"; docId: string }
  | { kind: "opening" };

export interface WorkshopState {
  on: boolean;
  /** Section id the draft starts after; 0 = before the first section. */
  boundary: number | null;
  target: Target;
}

// ── Distill ──────────────────────────────────────────────────────────────────

/** "memory", "an", or an entry: "entry:world", "entry:profile:<docId>", … */
export type DistillTargetId = string;

export interface DistillRecord {
  entryId?: string;
  /** hashText of the sources at compile time. */
  sourceHash: string;
  /** hashText of the text Story Engine wrote. */
  writtenHash: string;
}

export interface DistillState {
  records: Record<DistillTargetId, DistillRecord>;
  openingKept: boolean;
}

// ── Chat ─────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export interface ChatState {
  messages: ChatMessage[];
}

// ── Runtime ──────────────────────────────────────────────────────────────────

export interface Job {
  id: string;
  /** What the job is doing, for status lines: "Reviewing Tam". */
  label: string;
}

export interface RuntimeState {
  genx: GenerationState;
  /** GLM jobs queued or running, oldest first. */
  jobs: Job[];
  /** A Draft button is sending on the writer's behalf until the draft is done. */
  autoDraft: boolean;
}

export interface UIState {
  stage: StageId;
  /** The canon document open in the Canon stage. */
  openDocId: string | null;
  /** The lorebook entry selected in the lorebook (for the lorebook panel). */
  lorebookEntryId: string | null;
}

export interface RootState {
  canon: CanonState;
  workshop: WorkshopState;
  distill: DistillState;
  chat: ChatState;
  runtime: RuntimeState;
  ui: UIState;
}
