import { createSlice } from "../../../../lib/nai-store";
import { StoryState, DulfsItem } from "../types";
import {
  FIELD_CONFIGS,
  FieldID,
  DulfsFieldID,
} from "../../../config/field-definitions";

export const initialStoryState: StoryState = {
  fields: {},
  dulfs: {
    [FieldID.DramatisPersonae]: [],
    [FieldID.UniverseSystems]: [],
    [FieldID.Locations]: [],
    [FieldID.Factions]: [],
    [FieldID.SituationalDynamics]: [],
  } as Record<DulfsFieldID, DulfsItem[]>,
  attgEnabled: false,
  styleEnabled: false,
};

// Initialize fields from config
FIELD_CONFIGS.forEach((config) => {
  if (config.layout !== "list") {
    initialStoryState.fields[config.id] = {
      id: config.id,
      content: "",
      data: undefined,
    };
  }
});

export const storySlice = createSlice({
  name: "story",
  initialState: initialStoryState,
  reducers: {
    storyLoaded: (_state, payload: { story: StoryState }) => ({
      ...initialStoryState, // Reset then merge
      ...payload.story,
    }),
    storyCleared: () => initialStoryState,
    fieldUpdated: (
      state,
      payload: { fieldId: string; content: string; data?: any },
    ) => {
      const { fieldId, content, data } = payload;
      const field = state.fields[fieldId];
      if (!field) return state;
      return {
        ...state,
        fields: {
          ...state.fields,
          [fieldId]: {
            ...field,
            content: content !== undefined ? content : field.content,
            data: data !== undefined ? { ...field.data, ...data } : field.data,
          },
        },
      };
    },
    // DULFS
    dulfsItemAdded: (
      state,
      payload: { fieldId: DulfsFieldID; item: DulfsItem },
    ) => {
      const { fieldId, item } = payload;
      const list = state.dulfs[fieldId] || [];
      return {
        ...state,
        dulfs: {
          ...state.dulfs,
          [fieldId]: [...list, item],
        },
      };
    },
    dulfsItemRemoved: (
      state,
      payload: { fieldId: DulfsFieldID; itemId: string },
    ) => {
      const { fieldId, itemId } = payload;
      const list = state.dulfs[fieldId] || [];
      return {
        ...state,
        dulfs: {
          ...state.dulfs,
          [fieldId]: list.filter((item) => item.id !== itemId),
        },
      };
    },
    attgToggled: (state) => ({
      ...state,
      attgEnabled: !state.attgEnabled,
    }),
    styleToggled: (state) => ({
      ...state,
      styleEnabled: !state.styleEnabled,
    }),
  },
});

export const {
  storyLoaded,
  storyCleared,
  fieldUpdated,
  dulfsItemAdded,
  dulfsItemRemoved,
  attgToggled,
  styleToggled,
} = storySlice.actions;
