import { createSlice } from "nai-store";
import { FoundationState, ShapeData, IntensityData, ContractData } from "../types";

export const initialFoundationState: FoundationState = {
  shape: null,
  intent: "",
  worldState: "",
  intensity: null,
  contract: null,
  attg: "",
  style: "",
  attgSyncEnabled: false,
  styleSyncEnabled: false,
};

export const foundationSlice = createSlice({
  name: "foundation",
  initialState: initialFoundationState,
  reducers: {
    shapeUpdated: (state, payload: { shape: ShapeData | null }) => ({
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

    intensityUpdated: (state, payload: { intensity: IntensityData | null }) => ({
      ...state,
      intensity: payload.intensity,
    }),

    contractUpdated: (state, payload: { contract: ContractData | null }) => ({
      ...state,
      contract: payload.contract,
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

    attgSyncSet: (state, payload: { enabled: boolean }) => ({
      ...state,
      attgSyncEnabled: payload.enabled,
    }),

    styleSyncSet: (state, payload: { enabled: boolean }) => ({
      ...state,
      styleSyncEnabled: payload.enabled,
    }),

    foundationCleared: () => initialFoundationState,

    // Signal actions — Phase 2/3 effects handle generation
    shapeGenerationRequested: (state) => state,
    intentGenerationRequested: (state) => state,
    worldStateGenerationRequested: (state) => state,
    contractGenerationRequested: (state) => state,
    attgGenerationRequested: (state) => state,
    styleGenerationRequested: (state) => state,
  },
});

export const {
  foundationCleared,
  shapeUpdated,
  intentUpdated,
  worldStateUpdated,
  intensityUpdated,
  contractUpdated,
  attgUpdated,
  styleUpdated,
  attgSyncToggled,
  styleSyncToggled,
  attgSyncSet,
  styleSyncSet,
  shapeGenerationRequested,
  intentGenerationRequested,
  worldStateGenerationRequested,
  contractGenerationRequested,
  attgGenerationRequested,
  styleGenerationRequested,
} = foundationSlice.actions;
