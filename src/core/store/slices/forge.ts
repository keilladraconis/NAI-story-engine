import { createSlice } from "nai-store";

export interface Tombstone {
  name: string;
  category: string;
  reason: "user" | "model";
}

export interface ForgeSliceState {
  tombstonesByChatId: Record<string, Tombstone[]>;
}

export const initialForgeState: ForgeSliceState = {
  tombstonesByChatId: {},
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
  },
});

export const forgeSliceReducer = forgeSlice.reducer;
export const { tombstoneAdded, tombstonesClearedForChat } = forgeSlice.actions;
