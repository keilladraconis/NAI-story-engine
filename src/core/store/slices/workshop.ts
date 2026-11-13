import { createSlice } from "nai-store";
import type { Target, WorkshopState } from "../types";

export const initialWorkshopState: WorkshopState = {
  on: false,
  boundary: null,
  target: { kind: "vignette" },
};

export const workshopSlice = createSlice({
  name: "workshop",
  initialState: initialWorkshopState,
  reducers: {
    workshopTurnedOn: (state, p: { boundary: number }) => ({
      ...state,
      on: true,
      boundary: p.boundary,
    }),
    workshopTurnedOff: (state) => ({ ...state, on: false, boundary: null }),
    boundaryMoved: (state, p: { boundary: number }) => ({
      ...state,
      boundary: p.boundary,
    }),
    targetSet: (state, target: Target) => ({ ...state, target }),
  },
});

export const { workshopTurnedOn, workshopTurnedOff, boundaryMoved, targetSet } =
  workshopSlice.actions;
