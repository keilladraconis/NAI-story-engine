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
    uiChatSubmitUserMessage: (state, _payload: { chatId: string }) => state,
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
    uiChatRefineCommitted: (state) => state,
    uiChatRefineDiscarded: (state) => state,
    // Internal: Submit generation to GenX (not a user intent)
    generationSubmitted: (state, _strategy: any) => state,
    uiCancelRequest: (state, _payload: { requestId: string }) => state,
    // Editable singleton — at most one editor active at a time
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
  uiRequestCancellation,
  uiUserPresenceConfirmed,
  uiChatSubmitUserMessage,
  uiChatRetryGeneration,
  uiChatSummarizeRequested,
  uiChatRefineRequested,
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
