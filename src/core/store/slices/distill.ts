import { createSlice } from "nai-store";
import type { DistillRecord, DistillState, DistillTargetId } from "../types";

export const initialDistillState: DistillState = {
  records: {},
  openingKept: false,
};

export const distillSlice = createSlice({
  name: "distill",
  initialState: initialDistillState,
  reducers: {
    recordWritten: (
      state,
      p: { target: DistillTargetId; record: DistillRecord },
    ) => ({
      ...state,
      records: { ...state.records, [p.target]: p.record },
    }),
    recordRemoved: (state, p: { target: DistillTargetId }) => {
      const records = { ...state.records };
      delete records[p.target];
      return { ...state, records };
    },
    openingKeptSet: (state, p: { kept: boolean }) => ({
      ...state,
      openingKept: p.kept,
    }),
  },
});

export const { recordWritten, recordRemoved, openingKeptSet } =
  distillSlice.actions;
