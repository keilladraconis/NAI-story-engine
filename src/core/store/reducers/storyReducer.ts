import { StoryState, Action, StoryField, DulfsItem } from "../types";
import { ActionTypes } from "../actions";
import { FIELD_CONFIGS, FieldID, DulfsFieldID } from "../../../config/field-definitions";

export const initialStoryState: StoryState = {
  setting: "Original",
  fields: {},
  dulfs: {
    [FieldID.DramatisPersonae]: [],
    [FieldID.UniverseSystems]: [],
    [FieldID.Locations]: [],
    [FieldID.Factions]: [],
    [FieldID.SituationalDynamics]: [],
  } as Record<DulfsFieldID, DulfsItem[]>,
  dulfsSummaries: {},
  attgEnabled: false,
  styleEnabled: false,
};

// Initialize fields from config
FIELD_CONFIGS.forEach((config) => {
  if (config.layout !== "list") {
    initialStoryState.fields[config.id] = {
      id: config.id,
      content: "",
      data: config.id === FieldID.Brainstorm ? { messages: [] } : undefined,
    };
  }
});

export function storyReducer(state: StoryState = initialStoryState, action: Action): StoryState {
  switch (action.type) {
    case ActionTypes.STORY_LOADED:
      // Assuming payload is a partial or full StoryState. 
      // Need to be careful about merging deep structures if partial.
      // For now, assume full replacement or strict structure.
      return { ...initialStoryState, ...action.payload };

    case ActionTypes.STORY_CLEARED:
      return { ...initialStoryState };

    case ActionTypes.SETTING_UPDATED:
      return { ...state, setting: action.payload.setting };

    case ActionTypes.FIELD_UPDATED: {
      const { fieldId, content, data } = action.payload;
      const field = state.fields[fieldId];
      if (!field) return state; // Should not happen

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
    }

    case ActionTypes.DULFS_ITEM_ADDED: {
      const { fieldId, item } = action.payload;
      const list = state.dulfs[fieldId as DulfsFieldID] || [];
      return {
        ...state,
        dulfs: {
          ...state.dulfs,
          [fieldId]: [...list, item],
        },
      };
    }

    case ActionTypes.DULFS_ITEM_UPDATED: {
      const { fieldId, itemId, updates } = action.payload;
      const list = state.dulfs[fieldId as DulfsFieldID] || [];
      return {
        ...state,
        dulfs: {
          ...state.dulfs,
          [fieldId]: list.map((item) => (item.id === itemId ? { ...item, ...updates } : item)),
        },
      };
    }

    case ActionTypes.DULFS_ITEM_REMOVED: {
      const { fieldId, itemId } = action.payload;
      const list = state.dulfs[fieldId as DulfsFieldID] || [];
      return {
        ...state,
        dulfs: {
          ...state.dulfs,
          [fieldId]: list.filter((item) => item.id !== itemId),
        },
      };
    }

    case ActionTypes.DULFS_SUMMARY_UPDATED: {
      const { fieldId, summary } = action.payload;
      return {
        ...state,
        dulfsSummaries: {
          ...state.dulfsSummaries,
          [fieldId]: summary,
        },
      };
    }

    case ActionTypes.BRAINSTORM_MESSAGE_ADDED: {
      const { role, content } = action.payload;
      const field = state.fields[FieldID.Brainstorm];
      const messages = field?.data?.messages || [];
      return {
        ...state,
        fields: {
          ...state.fields,
          [FieldID.Brainstorm]: {
            ...field,
            data: {
              ...field.data,
              messages: [...messages, { role, content }]
            }
          }
        }
      };
    }

    case ActionTypes.TOGGLE_ATTG:
      return { ...state, attgEnabled: !state.attgEnabled };

    case ActionTypes.TOGGLE_STYLE:
      return { ...state, styleEnabled: !state.styleEnabled };

    default:
      return state;
  }
}
