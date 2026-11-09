import { createSlice } from "nai-store";
import type { GenerationState } from "nai-gen-x";
import type { Job, Offer, RuntimeState } from "../types";

export const initialRuntimeState: RuntimeState = {
  genx: { status: "idle", queueLength: 0 },
  jobs: [],
  autoDraft: false,
  offers: [],
  offerLead: "",
  offerPicked: "",
  direction: { text: "", seq: 0 },
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
    offersSet: (state, p: { lead: string; offers: Offer[] }) => ({
      ...state,
      offers: p.offers,
      offerLead: p.lead,
      offerPicked: "",
    }),
    /** Pick an offer; picking the picked one again unpicks it. */
    offerChosen: (state, p: { label: string }) => ({
      ...state,
      offerPicked: state.offerPicked === p.label ? "" : p.label,
    }),
    directionPreset: (state, p: { text: string }) => ({
      ...state,
      direction: { text: p.text, seq: state.direction.seq + 1 },
    }),
  },
});

export const {
  genxUpdated,
  jobQueued,
  jobFinished,
  autoDraftSet,
  offersSet,
  offerChosen,
  directionPreset,
} = runtimeSlice.actions;
