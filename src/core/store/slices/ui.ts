import { createSlice } from "nai-store";
import type { StageId, UIState } from "../types";

export const initialUIState: UIState = {
  stage: "talk",
  openDocId: null,
  lorebookEntryId: null,
};

export const uiSlice = createSlice({
  name: "ui",
  initialState: initialUIState,
  reducers: {
    stageOpened: (state, p: { stage: StageId }) => ({
      ...state,
      stage: p.stage,
    }),
    docOpened: (state, p: { id: string | null }) => ({
      ...state,
      openDocId: p.id,
    }),
    lorebookEntrySelected: (state, p: { entryId: string | null }) => ({
      ...state,
      lorebookEntryId: p.entryId,
    }),
  },
});

export const { stageOpened, docOpened, lorebookEntrySelected } =
  uiSlice.actions;
