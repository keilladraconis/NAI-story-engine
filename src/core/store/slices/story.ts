import { createSlice } from "nai-store";
import { StoryState } from "../types";
import { FIELD_CONFIGS } from "../../../config/field-definitions";

export const initialStoryState: StoryState = {
  fields: {},
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
    storyCleared: () => initialStoryState,
    fieldUpdated: (
      state,
      payload: {
        fieldId: string;
        content: string;
        data?: Record<string, unknown>;
      },
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
  storyCleared,
  fieldUpdated,
  attgToggled,
  styleToggled,
} = storySlice.actions;
