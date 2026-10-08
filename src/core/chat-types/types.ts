import type { AppDispatch, RootState } from "../store/types";

export type ChatLifecycle = "save" | "commit-discard";

export type ChatMessageRole = "system" | "user" | "assistant";

/** One labelled part of what a command carried, shown when its pill is opened. */
export interface PillPart {
  label: string;
  text: string;
}

export interface ForgeActionRecord {
  kind: "CREATE" | "REVISE" | "DELETE" | "RENAME" | "THREAD" | "UNKNOWN";
  status: "applied" | "rejected" | "unrecognized";
  /** CREATE element type, e.g. "SYSTEM". */
  elementType?: string;
  /** Entity / thread / old name. */
  name?: string;
  /** RENAME target name. */
  newName?: string;
  /** Rejection or unrecognized detail (reason, or the raw line). */
  reason?: string;
  /** What the command carried, for display. Absent on records stored before
   *  pills existed. */
  body?: PillPart[];
}

export type ForgeSegment =
  | { kind: "prose"; text: string }
  | { kind: "action"; action: ForgeActionRecord };

export interface ChatMessage {
  id: string;
  role: ChatMessageRole;
  content: string;
  /** Marks an assistant message as a candidate rewrite inside a refine chat. */
  refineCandidate?: boolean;
  /**
   * Optional tag for non-conversational messages. Renderers may treat tagged
   * messages distinctly (e.g., cleanup-turn confirmations, parser-rejection
   * warnings). Plain conversational turns leave this undefined.
   *
   * "refineSource" marks the seeded field-snapshot message in a refine chat:
   * while present, the refine rewrites that snapshot; deleting it switches the
   * refine to a fresh field generation.
   */
  messageKind?: "cleanup" | "refineSource";
  /** Ordered display projection of a forge turn (prose runs + action chips),
   *  built at completion. Display-only; `content` stays the raw canonical text. */
  forgeSegments?: ForgeSegment[];
  /** Which Scenario mode wrote this assistant message. Absent on messages
   *  from before the modes existed, which render as plain text. */
  mode?: "plan" | "build";
}

export type ChatSeed =
  | { kind: "blank" }
  | { kind: "fromStoryText"; sourceText: string }
  | { kind: "fromField"; sourceFieldId: string; sourceText: string };

export interface RefineTarget {
  fieldId: string;
  originalText: string;
  entryId?: string;
}

export interface Chat {
  id: string;
  type: string;
  title: string;
  subMode?: string;
  messages: ChatMessage[];
  seed: ChatSeed;
  refineTarget?: RefineTarget;
}

export interface RefineContext {
  fieldId: string;
  currentText: string;
  history: ChatMessage[];
}

export interface HeaderControl {
  id: string;
  /** Tag identifying which header control this is, so ChatHeader knows how to render. */
  kind:
    | "sessionsButton"
    | "newChatButton"
    | "label"
    | "backButton"
    | "scrubIndicator"
    | "modeToggle";
}

export interface SpecCtx {
  getState: () => RootState;
  dispatch: AppDispatch;
}

export interface InitializeResult {
  title: string;
  initialMessages: ChatMessage[];
  subMode?: string;
}

export interface ChatTypeSpec<SubMode extends string = string> {
  id: string;
  displayName: string;
  lifecycle: ChatLifecycle;
  subModes?: readonly SubMode[];
  defaultSubMode?: SubMode;

  initialize(seed: ChatSeed, ctx: SpecCtx): InitializeResult;
  systemPromptFor(chat: Chat, ctx: SpecCtx): string;
  prefillFor?(chat: Chat, ctx: SpecCtx): string | undefined;
  xialongStyleFor?(chat: Chat, ctx: SpecCtx): string | undefined;
  contextSlice(chat: Chat, ctx: SpecCtx): ChatMessage[];
  headerControls(chat: Chat, ctx: SpecCtx): HeaderControl[];

  onCommit?(chat: Chat, ctx: SpecCtx): void;
  onDiscard?(chat: Chat, ctx: SpecCtx): void;
  /**
   * Optional handler for the chat-input Clear button. When present it replaces
   * the default (clear the input's message history). The refine spec uses this
   * to drop the seeded context and run a fresh generation in one click.
   */
  onClear?(chat: Chat, ctx: SpecCtx): void;

  /**
   * Returns ids of entities that should render inline beneath the given message.
   * Called by `ChatPanel` once per message during rebuild. Default: no inline entities.
   */
  inlineEntityIdsFor?(message: ChatMessage, chat: Chat, ctx: SpecCtx): string[];

  /**
   * Handles a user send action for this chat. Return true if the spec fully
   * handled the send (no fallback to the standard chat-strategy path). Called
   * by the `uiChatSubmitUserMessage` effect with the submitted text.
   */
  handleSend?(chat: Chat, content: string, ctx: SpecCtx): boolean;

  /**
   * Optional chat-input customization, read by `SeBrainstormInput` for the
   * active chat. Defaults when omitted: generic placeholder, a "Send" button,
   * and the Clear button shown.
   */
  inputPlaceholder?: string;
  /** A placeholder that depends on the chat (its mode). Wins over
   *  `inputPlaceholder` when present. */
  inputPlaceholderFor?(chat: Chat): string;
  sendLabel?: string;
  showClearButton?: boolean;
}

export type AnyChatTypeSpec = ChatTypeSpec<string>;
