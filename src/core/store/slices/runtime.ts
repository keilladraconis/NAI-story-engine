import { createSlice } from "nai-store";
import type { GenerationState } from "nai-gen-x";
import type { Job, RuntimeState } from "../types";

export const initialRuntimeState: RuntimeState = {
  genx: { status: "idle", queueLength: 0 },
  jobs: [],
  autoDraft: false,
};

export const runtimeSlice = createSlice({
  name: "runtime",
  initialState: initialRuntimeState,
  reducers: {
    genxUpdated: (state, genx: GenerationState) => ({ ...state, genx }),
    jobQueued: (state, job: Job) => ({ ...state, jobs: [...state.jobs, job] }),
    autoDraftSet: (state, p: { on: boolean }) => ({
      ...state,
      autoDraft: p.on,
    }),
    jobFinished: (state, p: { id: string }) => ({
      ...state,
      jobs: state.jobs.filter((j) => j.id !== p.id),
    }),
  },
});

export const { genxUpdated, jobQueued, jobFinished, autoDraftSet } =
  runtimeSlice.actions;
