import { createSlice } from "nai-store";
import type {
  Brief,
  CanonDoc,
  CanonState,
  Review,
  StartingPoint,
  Vignette,
} from "../types";

export const emptyBrief: Brief = {
  title: "",
  genre: "",
  premise: "",
  voice: "",
  heat: "",
  pace: "",
  limits: "",
  notes: "",
};

export const initialCanonState: CanonState = {
  brief: emptyBrief,
  vignettes: [],
  startingPoint: { now: "", notYet: "" },
  docs: [],
  castReviewed: false,
};

const mapDoc = (
  state: CanonState,
  id: string,
  fn: (doc: CanonDoc) => CanonDoc,
): CanonState => ({
  ...state,
  docs: state.docs.map((d) => (d.id === id ? fn(d) : d)),
});

export const canonSlice = createSlice({
  name: "canon",
  initialState: initialCanonState,
  reducers: {
    briefUpdated: (state, patch: Partial<Brief>) => ({
      ...state,
      brief: { ...state.brief, ...patch },
    }),

    vignetteAdded: (state, vignette: Vignette) => ({
      ...state,
      vignettes: [...state.vignettes, vignette],
    }),
    vignetteUpdated: (
      state,
      p: { id: string; title?: string; text?: string },
    ) => ({
      ...state,
      vignettes: state.vignettes.map((v) =>
        v.id === p.id
          ? { ...v, title: p.title ?? v.title, text: p.text ?? v.text }
          : v,
      ),
    }),
    vignetteRemoved: (state, p: { id: string }) => ({
      ...state,
      vignettes: state.vignettes.filter((v) => v.id !== p.id),
    }),

    startingPointSet: (state, startingPoint: StartingPoint) => ({
      ...state,
      startingPoint,
    }),

    docAdded: (state, doc: CanonDoc) => ({
      ...state,
      docs: [...state.docs, doc],
    }),
    docTextSet: (state, p: { id: string; text: string }) =>
      mapDoc(state, p.id, (d) => ({ ...d, text: p.text })),
    docTitleSet: (state, p: { id: string; title: string }) =>
      mapDoc(state, p.id, (d) => ({ ...d, title: p.title })),
    docRemoved: (state, p: { id: string }) => ({
      ...state,
      docs: state.docs.filter((d) => d.id !== p.id),
    }),
    docReviewed: (state, p: { id: string; review: Review }) =>
      mapDoc(state, p.id, (d) => ({ ...d, review: p.review })),
    issueDismissed: (state, p: { docId: string; issueId: string }) =>
      mapDoc(state, p.docId, (d) =>
        d.review
          ? {
              ...d,
              review: {
                ...d.review,
                issues: d.review.issues.filter((i) => i.id !== p.issueId),
              },
            }
          : d,
      ),

    castReviewedSet: (state, p: { reviewed: boolean }) => ({
      ...state,
      castReviewed: p.reviewed,
    }),
  },
});

export const {
  briefUpdated,
  vignetteAdded,
  vignetteUpdated,
  vignetteRemoved,
  startingPointSet,
  docAdded,
  docTextSet,
  docTitleSet,
  docRemoved,
  docReviewed,
  issueDismissed,
  castReviewedSet,
} = canonSlice.actions;
