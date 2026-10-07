import { createSlice } from "nai-store";
import { FoundationState, IntensityData, ContractData } from "../types";

export const initialFoundationState: FoundationState = {
  situation: "",
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
    situationUpdated: (state, payload: { situation: string }) => ({
      ...state,
      situation: payload.situation,
    }),

    worldStateUpdated: (state, payload: { worldState: string }) => ({
      ...state,
      worldState: payload.worldState,
    }),

    intensityUpdated: (
      state,
      payload: { intensity: IntensityData | null },
    ) => ({
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
    situationGenerationRequested: (state) => state,
    worldStateGenerationRequested: (state) => state,
    contractGenerationRequested: (state) => state,
    attgGenerationRequested: (state) => state,
    styleGenerationRequested: (state) => state,
  },
});

export const {
  foundationCleared,
  situationUpdated,
  worldStateUpdated,
  intensityUpdated,
  contractUpdated,
  attgUpdated,
  styleUpdated,
  attgSyncToggled,
  styleSyncToggled,
  attgSyncSet,
  styleSyncSet,
  situationGenerationRequested,
  worldStateGenerationRequested,
  contractGenerationRequested,
  attgGenerationRequested,
  styleGenerationRequested,
} = foundationSlice.actions;

/** A stored Foundation narrowed to the fields this build has. Shape and Intent
 *  were removed; left in the object they would be saved back for ever. */
export function pickFoundation(
  stored: Partial<FoundationState>,
): FoundationState {
  const next = { ...initialFoundationState };
  for (const key of Object.keys(next) as (keyof FoundationState)[]) {
    if (stored[key] !== undefined) {
      (next as Record<keyof FoundationState, unknown>)[key] = stored[key];
    }
  }
  return next;
}
