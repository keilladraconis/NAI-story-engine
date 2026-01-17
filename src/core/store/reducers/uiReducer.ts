import { UIState } from "../types";
import { Action } from "../store";

export const initialUIState: UIState = {
  activeTab: "editor",
  sidebarOpen: true,
  selectedLorebookEntryId: null,
  selectedLorebookCategoryId: null,
  lorebookEditMode: false,
  collapsedSections: {},
  editModes: {},
  brainstormEditingMessageId: null,
  inputs: {},
  showClearConfirm: false,
};

export function uiReducer(
  state: UIState = initialUIState,
  action: Action,
): UIState {
  switch (action.type) {
    case "ui/inputChanged": {
      const { id, value } = action.payload;
      return {
        ...state,
        inputs: {
          ...state.inputs,
          [id]: value,
        },
      };
    }

    case "ui/brainstormEditStarted":
      return {
        ...state,
        brainstormEditingMessageId: action.payload.messageId,
      };

    case "ui/brainstormEditEnded":
      // Only clear if the ending message is the one currently editing
      if (state.brainstormEditingMessageId === action.payload.messageId) {
        return {
          ...state,
          brainstormEditingMessageId: null,
        };
      }
      return state;

    case "ui/sectionToggled": {
      const { id } = action.payload;
      return {
        ...state,
        collapsedSections: {
          ...state.collapsedSections,
          [id]: !state.collapsedSections[id],
        },
      };
    }

    case "ui/editModeToggled": {
      const { id } = action.payload;
      api.v1.log("editmodetoggled", state.editModes, id);
      return {
        ...state,
        editModes: {
          ...state.editModes,
          [id]: !state.editModes[id],
        },
      };
    }

    case "ui/lorebookSelected": {
      const { entryId, categoryId } = action.payload;
      return {
        ...state,
        selectedLorebookEntryId: entryId,
        selectedLorebookCategoryId: categoryId,
        lorebookEditMode: false, // Reset edit mode on selection change
      };
    }

    case "ui/lorebookEditModeToggled":
      return {
        ...state,
        lorebookEditMode: !state.lorebookEditMode,
      };

    case "ui/clearConfirmToggled":
      return {
        ...state,
        showClearConfirm: !state.showClearConfirm,
      };

    default:
      return state;
  }
}
