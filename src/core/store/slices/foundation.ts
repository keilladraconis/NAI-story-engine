import { createSlice } from "nai-store";
import { FoundationState, Tension } from "../types";

export const initialFoundationState: FoundationState = {
  shape: "",
  intent: "",
  worldState: "",
  tensions: [],
  attg: "",
  style: "",
  attgSyncEnabled: false,
  styleSyncEnabled: false,
};

export const foundationSlice = createSlice({
  name: "foundation",
  initialState: initialFoundationState,
  reducers: {
    shapeUpdated: (state, payload: { shape: string }) => ({
      ...state,
      shape: payload.shape,
    }),

    intentUpdated: (state, payload: { intent: string }) => ({
      ...state,
      intent: payload.intent,
    }),

    worldStateUpdated: (state, payload: { worldState: string }) => ({
      ...state,
      worldState: payload.worldState,
    }),

    tensionAdded: (state, payload: { tension: Tension }) => ({
      ...state,
      tensions: [...state.tensions, payload.tension],
    }),

    tensionEdited: (state, payload: { tensionId: string; text: string }) => ({
      ...state,
      tensions: state.tensions.map((t) =>
        t.id === payload.tensionId ? { ...t, text: payload.text } : t,
      ),
    }),

    tensionResolved: (state, payload: { tensionId: string }) => ({
      ...state,
      tensions: state.tensions.map((t) =>
        t.id === payload.tensionId ? { ...t, resolved: true } : t,
      ),
    }),

    tensionDeleted: (state, payload: { tensionId: string }) => ({
      ...state,
      tensions: state.tensions.filter((t) => t.id !== payload.tensionId),
    }),

    attgUpdated: (state, payload: { attg: string }) => ({
      ...state,
      attg: payload.attg,
    }),

    styleUpdated: (state, payload: { style: string }) => ({
      ...state,
      style: payload.style,
    }),

    attgSyncToggled: (state) => ({
      ...state,
      attgSyncEnabled: !state.attgSyncEnabled,
    }),

    styleSyncToggled: (state) => ({
      ...state,
      styleSyncEnabled: !state.styleSyncEnabled,
    }),

    // Signal actions — Phase 2/3 effects handle generation
    shapeGenerationRequested: (state) => state,
    intentGenerationRequested: (state) => state,
    worldStateGenerationRequested: (state) => state,
  },
});

export const {
  shapeUpdated,
  intentUpdated,
  worldStateUpdated,
  tensionAdded,
  tensionEdited,
  tensionResolved,
  tensionDeleted,
  attgUpdated,
  styleUpdated,
  attgSyncToggled,
  styleSyncToggled,
  shapeGenerationRequested,
  intentGenerationRequested,
  worldStateGenerationRequested,
} = foundationSlice.actions;
