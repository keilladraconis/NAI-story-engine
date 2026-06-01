import type { AppDispatch, RootState } from "../store/types";

export type ChatLifecycle = "save" | "commit-discard";

export type ChatMessageRole = "system" | "user" | "assistant";

export interface ForgeActionRecord {
  kind: "CREATE" | "REVISE" | "DELETE" | "RENAME" | "THREAD" | "CRITIQUE" | "UNKNOWN";
  status: "applied" | "rejected" | "unrecognized";
  /** CREATE element type, e.g. "SYSTEM". */
  elementType?: string;
  /** Entity / thread / old name. */
  name?: string;
  /** RENAME target name. */
  newName?: string;
  /** CRITIQUE body. */
  text?: string;
  /** Rejection or unrecognized detail (reason, or the raw line). */
  reason?: string;
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
   */
  messageKind?: "cleanup";
  /** Ordered display projection of a forge turn (prose runs + action chips),
   *  built at completion. Display-only; `content` stays the raw canonical text. */
  forgeSegments?: ForgeSegment[];
}

export type ChatSeed =
  | { kind: "blank" }
  | { kind: "fromChat"; sourceChatId: string }
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
    | "subModeToggle"
    | "summarizeButton"
    | "sessionsButton"
    | "newChatButton"
    | "label"
    | "castAllButton"
    | "discardAllButton"
    | "phaseIndicator"
    | "forgeAheadButton"
    | "scrubIndicator";
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
   * Returns ids of entities that should render inline beneath the given message.
   * Called by `ChatPanel` once per message during rebuild. Default: no inline entities.
   */
  inlineEntityIdsFor?(
    message: ChatMessage,
    chat: Chat,
    ctx: SpecCtx,
  ): string[];

  /**
   * Handles a user send action for this chat. Return true if the spec fully
   * handled the send (no fallback to the standard chat-strategy path). Called
   * by the `uiChatSubmitUserMessage` effect after reading the input value.
   */
  handleSend?(chat: Chat, content: string, ctx: SpecCtx): boolean;

  /**
   * Optional chat-input customization, read by `SeBrainstormInput` for the
   * active chat. Defaults when omitted: generic placeholder, a "Send" button,
   * and the Clear button shown.
   */
  inputPlaceholder?: string;
  sendLabel?: string;
  showClearButton?: boolean;
}

export type AnyChatTypeSpec = ChatTypeSpec<string>;
