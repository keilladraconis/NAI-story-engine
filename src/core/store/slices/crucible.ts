import { createSlice } from "nai-store";
import {
  CrucibleState,
  CrucibleTension,
  CruciblePhase,
  CrucibleWorldElement,
  CrucibleLink,
} from "../types";

export const initialCrucibleState: CrucibleState = {
  phase: "direction",
  direction: null,
  shape: null,
  cast: false,
  tensions: [],
  elements: [],
  links: [],
  passes: [],
  activeCritique: null,
};

export const crucibleSlice = createSlice({
  name: "crucible",
  initialState: initialCrucibleState,
  reducers: {
    // Signal actions — effects handle the actual work
    crucibleShapeRequested: (state) => state,
    crucibleTensionsRequested: (state) => state,
    crucibleBuildPassRequested: (state) => state,
    crucibleStopRequested: (state) => state,
    crucibleCastRequested: (state) => state,

    // Phase transitions
    phaseTransitioned: (state, payload: { phase: CruciblePhase }) => {
      // Starting a fresh build — clear all derived data so previous results don't accumulate
      if (payload.phase === "building") {
        return {
          ...state,
          phase: payload.phase,
          cast: false,
          elements: [],
          links: [],
          passes: [],
          activeCritique: null,
        };
      }
      return { ...state, phase: payload.phase };
    },

    // Cast outcome
    castCompleted: (state) => {
      return { ...state, cast: true };
    },

    // Shape generation
    updateShape: (state, payload: { name: string; instruction: string }) => {
      return { ...state, shape: { name: payload.name, instruction: payload.instruction } };
    },

    // Direction phase reducers
    crucibleDirectionRequested: (state) => state,
    directionSet: (state, payload: { direction: string }) => {
      return { ...state, direction: payload.direction };
    },
    crucibleDirectionEdited: (state, payload: { text: string }) => {
      return { ...state, direction: payload.text };
    },

    // Tension management
    tensionsDerived: (state, payload: { tensions: CrucibleTension[] }) => {
      return { ...state, tensions: [...state.tensions, ...payload.tensions] };
    },

    tensionRemoved: (state, payload: { tensionId: string }) => {
      return {
        ...state,
        tensions: state.tensions.filter((t) => t.id !== payload.tensionId),
      };
    },

    tensionTextUpdated: (state, payload: { tensionId: string; text: string }) => {
      return {
        ...state,
        tensions: state.tensions.map((t) =>
          t.id === payload.tensionId ? { ...t, text: payload.text } : t,
        ),
      };
    },

    tensionAcceptanceToggled: (state, payload: { tensionId: string }) => {
      return {
        ...state,
        tensions: state.tensions.map((t) =>
          t.id === payload.tensionId ? { ...t, accepted: !t.accepted } : t,
        ),
      };
    },

    tensionsCleared: (state) => {
      return { ...state, tensions: [] };
    },

    // World elements (from command parser)
    elementCreated: (state, payload: { element: CrucibleWorldElement }) => {
      return { ...state, elements: [...state.elements, payload.element] };
    },

    elementRevised: (state, payload: { id: string; content: string }) => {
      return {
        ...state,
        elements: state.elements.map((e) =>
          e.id === payload.id ? { ...e, content: payload.content } : e,
        ),
      };
    },

    elementDeleted: (state, payload: { id: string }) => {
      return {
        ...state,
        elements: state.elements.filter((e) => e.id !== payload.id),
        // Also remove any links referencing this element
        links: state.links.filter((l) => {
          const el = state.elements.find((e) => e.id === payload.id);
          if (!el) return true;
          return l.fromName !== el.name && l.toName !== el.name;
        }),
      };
    },

    // Manual element editing (from review UI)
    elementUpdated: (state, payload: { id: string; name?: string; content?: string }) => {
      return {
        ...state,
        elements: state.elements.map((e) =>
          e.id === payload.id
            ? {
              ...e,
              ...(payload.name !== undefined ? { name: payload.name } : {}),
              ...(payload.content !== undefined ? { content: payload.content } : {}),
            }
            : e,
        ),
      };
    },

    elementRemoved: (state, payload: { id: string }) => {
      return {
        ...state,
        elements: state.elements.filter((e) => e.id !== payload.id),
      };
    },

    // Links
    linkCreated: (state, payload: { link: CrucibleLink }) => {
      return { ...state, links: [...state.links, payload.link] };
    },

    linkRemoved: (state, payload: { id: string }) => {
      return {
        ...state,
        links: state.links.filter((l) => l.id !== payload.id),
      };
    },

    // Critique
    critiqueSet: (state, payload: { critique: string }) => {
      return { ...state, activeCritique: payload.critique };
    },

    // Build pass completed
    buildPassCompleted: (state, payload: { passNumber: number; commandLog: string[]; guidance: string }) => {
      return {
        ...state,
        passes: [...state.passes, {
          passNumber: payload.passNumber,
          commandLog: payload.commandLog,
          guidance: payload.guidance,
        }],
      };
    },

    crucibleReset: () => {
      return { ...initialCrucibleState };
    },
  },
});

export const {
  crucibleShapeRequested,
  crucibleTensionsRequested,
  crucibleBuildPassRequested,
  crucibleStopRequested,
  crucibleCastRequested,
  castCompleted,
  phaseTransitioned,
  updateShape,
  crucibleDirectionRequested,
  directionSet,
  crucibleDirectionEdited,
  tensionsDerived,
  tensionRemoved,
  tensionTextUpdated,
  tensionAcceptanceToggled,
  tensionsCleared,
  elementCreated,
  elementRevised,
  elementDeleted,
  elementUpdated,
  elementRemoved,
  linkCreated,
  linkRemoved,
  critiqueSet,
  buildPassCompleted,
  crucibleReset,
} = crucibleSlice.actions;
