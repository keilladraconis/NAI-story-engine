import { createSlice } from "nai-store";

export interface Tombstone {
  name: string;
  category: string;
  reason: "user" | "model";
}

export interface ForgeSliceState {
  tombstonesByChatId: Record<string, Tombstone[]>;
  /** Names discarded since the last forge turn, awaiting a reference-scrub
   *  cleanup that the next continue dispatch leads off with. */
  pendingScrubByChatId: Record<string, string[]>;
}

export const initialForgeState: ForgeSliceState = {
  tombstonesByChatId: {},
  pendingScrubByChatId: {},
};

export const forgeSlice = createSlice({
  name: "forge",
  initialState: initialForgeState,
  reducers: {
    tombstoneAdded: (
      state,
      payload: { chatId: string; tombstone: Tombstone },
    ) => {
      const existing = state.tombstonesByChatId[payload.chatId] ?? [];
      const dup = existing.some(
        (t) =>
          t.name.toLowerCase() === payload.tombstone.name.toLowerCase() &&
          t.category === payload.tombstone.category,
      );
      if (dup) return state;
      return {
        ...state,
        tombstonesByChatId: {
          ...state.tombstonesByChatId,
          [payload.chatId]: [...existing, payload.tombstone],
        },
      };
    },

    tombstonesClearedForChat: (state, payload: { chatId: string }) => {
      if (!state.tombstonesByChatId[payload.chatId]) return state;
      const { [payload.chatId]: _, ...rest } = state.tombstonesByChatId;
      return { ...state, tombstonesByChatId: rest };
    },

    scrubQueued: (state, payload: { chatId: string; names: string[] }) => {
      const existing = state.pendingScrubByChatId[payload.chatId] ?? [];
      const seen = new Set(existing.map((n) => n.toLowerCase()));
      const added = payload.names.filter((n) => !seen.has(n.toLowerCase()));
      if (added.length === 0) return state;
      return {
        ...state,
        pendingScrubByChatId: {
          ...state.pendingScrubByChatId,
          [payload.chatId]: [...existing, ...added],
        },
      };
    },

    scrubCleared: (state, payload: { chatId: string }) => {
      if (!state.pendingScrubByChatId[payload.chatId]) return state;
      const { [payload.chatId]: _, ...rest } = state.pendingScrubByChatId;
      return { ...state, pendingScrubByChatId: rest };
    },
  },
});

export const forgeSliceReducer = forgeSlice.reducer;
export const {
  tombstoneAdded,
  tombstonesClearedForChat,
  scrubQueued,
  scrubCleared,
} = forgeSlice.actions;
