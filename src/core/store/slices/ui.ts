import { createSlice } from "nai-store";
import { UIState, LorebookUIState } from "../types";

const initialLorebookState: LorebookUIState = {
  selectedEntryId: null,
  selectedCategoryId: null,
};

export const initialUIState: UIState = {
  activeEditId: null,
  inputs: {},
  lorebook: initialLorebookState,
  worldExpanded: null,
  importWizardOpen: false,
};

export const uiSlice = createSlice({
  name: "ui",
  initialState: initialUIState,
  reducers: {
    uiInputChanged: (state, payload: { id: string; value: string }) => ({
      ...state,
      inputs: {
        ...state.inputs,
        [payload.id]: payload.value,
      },
    }),
    // Intents (handled by Effects)
    uiRequestCancellation: (state) => state,
    uiUserPresenceConfirmed: (state) => state,
    // Chat user intents
    // `text` travels in the payload, NOT via a shared storyStorage slot: the
    // effect's read is async, so two sends in flight at once would both read
    // whatever the last one wrote (see ChatInput's duplicate-tap note).
    uiChatSubmitUserMessage: (
      state,
      _payload: { chatId: string; text: string },
    ) => state,
    uiChatRetryGeneration: (
      state,
      _payload: { chatId: string; messageId: string },
    ) => state,
    uiChatSummarizeRequested: (
      state,
      _payload: {
        seed:
          | { kind: "fromChat"; sourceChatId: string }
          | { kind: "fromStoryText"; sourceText: string };
      },
    ) => state,
    uiChatRefineRequested: (
      state,
      _payload: { fieldId: string; sourceText: string; entryId?: string },
    ) => state,
    // Run a refine generation turn (rewrite or fresh-generate, decided by the
    // strategy from the seeded-context presence) — fired by the refine send and
    // the refine Clear/onClear hook.
    uiChatRefineGenerateRequested: (state, _payload: { chatId: string }) =>
      state,
    uiChatRefineCommitted: (state, _payload: { chatId: string }) => state,
    uiChatRefineDiscarded: (state, _payload: { chatId: string }) => state,
    // Internal: Submit generation to GenX (not a user intent)
    generationSubmitted: (state, _strategy: any) => state,
    uiCancelRequest: (state, _payload: { requestId: string }) => state,
    // Editable singleton — at most one editor active at a time. `id` is an
    // entity id, a world group id, or a Foundation field id ("shape", "intent",
    // …); the Setup and Engine tabs route the open pane by membership.
    uiEditableActivate: (state, payload: { id: string }) => ({
      ...state,
      activeEditId: payload.id,
    }),
    uiEditableDeactivate: (state) => ({
      ...state,
      activeEditId: null,
    }),
    // Lorebook user intents (handled by effects)
    uiLorebookEntrySelected: (
      state,
      payload: { entryId: string | null; categoryId: string | null },
    ) => ({
      ...state,
      lorebook: {
        ...state.lorebook,
        selectedEntryId: payload.entryId,
        selectedCategoryId: payload.categoryId,
      },
    }),
    uiLorebookContentGenerationRequested: (
      state,
      _payload: { requestId: string },
    ) => state,
    uiLorebookKeysGenerationRequested: (
      state,
      _payload: { requestId: string },
    ) => state,
    // Item-level lorebook generation (queues both content + keys)
    uiLorebookItemGenerationRequested: (
      state,
      _payload: {
        entryId: string;
        contentRequestId: string;
        keysRequestId: string;
      },
    ) => state,
    // World expand/collapse all
    worldExpansionSet: (state, payload: { expanded: boolean }) => ({
      ...state,
      worldExpanded: payload.expanded,
    }),
    // Import wizard visibility (shown over the Setup tab)
    importWizardOpened: (state) => ({ ...state, importWizardOpen: true }),
    importWizardClosed: (state) => ({ ...state, importWizardOpen: false }),
    // Summary generation intents
    uiEntitySummaryGenerationRequested: (
      state,
      _payload: { entityId: string; requestId: string },
    ) => state,
    uiThreadSummaryGenerationRequested: (
      state,
      _payload: { groupId: string; requestId: string },
    ) => state,
  },
});

export const {
  uiInputChanged,
  worldExpansionSet,
  importWizardOpened,
  importWizardClosed,
  uiRequestCancellation,
  uiUserPresenceConfirmed,
  uiChatSubmitUserMessage,
  uiChatRetryGeneration,
  uiChatSummarizeRequested,
  uiChatRefineRequested,
  uiChatRefineGenerateRequested,
  uiChatRefineCommitted,
  uiChatRefineDiscarded,
  generationSubmitted,
  uiCancelRequest,
  uiEditableActivate,
  uiEditableDeactivate,
  uiLorebookEntrySelected,
  uiLorebookContentGenerationRequested,
  uiLorebookKeysGenerationRequested,
  uiLorebookItemGenerationRequested,
  uiEntitySummaryGenerationRequested,
  uiThreadSummaryGenerationRequested,
} = uiSlice.actions;
