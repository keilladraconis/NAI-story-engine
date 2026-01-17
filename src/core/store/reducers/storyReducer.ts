import { StoryState, DulfsItem } from "../types";
import { Action } from "../store";
import {
  FIELD_CONFIGS,
  FieldID,
  DulfsFieldID,
} from "../../../config/field-definitions";

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

export function storyReducer(
  state: StoryState = initialStoryState,
  action: Action,
): StoryState {
  switch (action.type) {
    case "story/loaded":
      // Payload is { story: StoryState }
      return { ...initialStoryState, ...action.payload.story };

    case "story/cleared":
      return { ...initialStoryState };

    case "story/settingUpdated":
      return { ...state, setting: action.payload.setting };

    case "story/fieldUpdated": {
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

    case "story/dulfsItemAdded": {
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

    case "story/dulfsItemUpdated": {
      const { fieldId, itemId, updates } = action.payload;
      const list = state.dulfs[fieldId as DulfsFieldID] || [];
      return {
        ...state,
        dulfs: {
          ...state.dulfs,
          [fieldId]: list.map((item) =>
            item.id === itemId ? { ...item, ...updates } : item,
          ),
        },
      };
    }

    case "story/dulfsItemRemoved": {
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

    case "story/dulfsSummaryUpdated": {
      const { fieldId, summary } = action.payload;
      return {
        ...state,
        dulfsSummaries: {
          ...state.dulfsSummaries,
          [fieldId]: summary,
        },
      };
    }

    case "story/brainstormSubmitMessage": {
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
              messages: [...messages, { role, content }],
            },
          },
        },
      };
    }

    case "story/brainstormMessageEdited": {
      const { index, content } = action.payload;
      const field = state.fields[FieldID.Brainstorm];
      const messages = field?.data?.messages || [];
      if (index < 0 || index >= messages.length || !messages[index])
        return state;

      const newMessages = [...messages];
      newMessages[index] = { ...newMessages[index], content };

      return {
        ...state,
        fields: {
          ...state.fields,
          [FieldID.Brainstorm]: {
            ...field,
            data: { ...field.data, messages: newMessages },
          },
        },
      };
    }

    case "story/brainstormMessageDeleted": {
      const { index } = action.payload;
      const field = state.fields[FieldID.Brainstorm];
      const messages = field?.data?.messages || [];
      if (index < 0 || index >= messages.length) return state;

      const newMessages = messages.filter((_: any, i: number) => i !== index);

      return {
        ...state,
        fields: {
          ...state.fields,
          [FieldID.Brainstorm]: {
            ...field,
            data: { ...field.data, messages: newMessages },
          },
        },
      };
    }

    case "story/brainstormRetry": {
      const { index } = action.payload;
      const field = state.fields[FieldID.Brainstorm];
      const messages = field?.data?.messages || [];
      if (index < 0 || index >= messages.length) return state;

      const targetMessage = messages[index];
      let newMessages;

      if (targetMessage.role === "user") {
        // Keep up to and including the user message
        newMessages = messages.slice(0, index + 1);
      } else {
        // Assistant message: Remove it and everything after, keeping up to the previous message
        newMessages = messages.slice(0, index);
      }

      return {
        ...state,
        fields: {
          ...state.fields,
          [FieldID.Brainstorm]: {
            ...field,
            data: { ...field.data, messages: newMessages },
          },
        },
      };
    }

    case "story/toggleAttg":
      return { ...state, attgEnabled: !state.attgEnabled };

    case "story/toggleStyle":
      return { ...state, styleEnabled: !state.styleEnabled };

    default:
      return state;
  }
}
