import { createSlice } from "nai-store";
import type { GenerationState } from "nai-gen-x";
import type {
  Job,
  Offer,
  OfferKind,
  OfferSet,
  PlanItem,
  RuntimeState,
} from "../types";

export const initialRuntimeState: RuntimeState = {
  genx: { status: "idle", queueLength: 0 },
  jobs: [],
  autoDraft: false,
  offers: {
    vignette: { offers: [], lead: "", picked: "" },
    startingPoint: { offers: [], lead: "", picked: "" },
  },
  plan: [],
  build: { running: false, done: 0, total: 0, current: "" },
};

function withSet(
  state: RuntimeState,
  kind: OfferKind,
  set: OfferSet,
): RuntimeState {
  return { ...state, offers: { ...state.offers, [kind]: set } };
}

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
    offersSet: (state, p: { kind: OfferKind; lead: string; offers: Offer[] }) =>
      withSet(state, p.kind, { offers: p.offers, lead: p.lead, picked: "" }),
    /** Pick an offer; picking the picked one again unpicks it. */
    offerChosen: (state, p: { kind: OfferKind; label: string }) => {
      const set = state.offers[p.kind];
      return withSet(state, p.kind, {
        ...set,
        picked: set.picked === p.label ? "" : p.label,
      });
    },
    /** The picked offer was drafted and saved: nothing is picked now. */
    offerUnpicked: (state, p: { kind: OfferKind }) =>
      withSet(state, p.kind, { ...state.offers[p.kind], picked: "" }),
    planSet: (state, p: { items: PlanItem[] }) => ({ ...state, plan: p.items }),
    /** Pick or unpick one planned document, by its index. */
    planToggled: (state, p: { index: number }) => ({
      ...state,
      plan: state.plan.map((item, i) =>
        i === p.index ? { ...item, picked: !item.picked } : item,
      ),
    }),
    buildProgressed: (state, build: RuntimeState["build"]) => ({
      ...state,
      build,
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
  offerUnpicked,
  planSet,
  planToggled,
  buildProgressed,
} = runtimeSlice.actions;
