import { UIState, Action } from "../types";
import { ActionTypes } from "../actions";

export const initialUIState: UIState = {
  activeTab: "editor",
  sidebarOpen: true,
  selectedLorebookEntryId: null,
  selectedLorebookCategoryId: null,
  lorebookEditMode: false,
  collapsedSections: {},
  editModes: {},
  inputs: {},
  showClearConfirm: false,
};

export function uiReducer(state: UIState = initialUIState, action: Action): UIState {
  switch (action.type) {
    case ActionTypes.UI_INPUT_CHANGED: {
      const { id, value } = action.payload;
      return {
        ...state,
        inputs: {
          ...state.inputs,
          [id]: value,
        },
      };
    }

    case ActionTypes.UI_SECTION_TOGGLED: {
      const { id } = action.payload;
      return {
        ...state,
        collapsedSections: {
          ...state.collapsedSections,
          [id]: !state.collapsedSections[id],
        },
      };
    }

    case ActionTypes.UI_EDIT_MODE_TOGGLED: {
      const { id } = action.payload;
      return {
        ...state,
        editModes: {
          ...state.editModes,
          [id]: !state.editModes[id],
        },
      };
    }

    case ActionTypes.UI_LOREBOOK_SELECTED: {
      const { entryId, categoryId } = action.payload;
      return {
        ...state,
        selectedLorebookEntryId: entryId,
        selectedLorebookCategoryId: categoryId,
        lorebookEditMode: false, // Reset edit mode on selection change
      };
    }

    case ActionTypes.UI_LOREBOOK_EDIT_MODE_TOGGLED:
      return {
        ...state,
        lorebookEditMode: !state.lorebookEditMode,
      };

    case ActionTypes.UI_CLEAR_CONFIRM_TOGGLED:
      return {
        ...state,
        showClearConfirm: !state.showClearConfirm,
      };

    default:
      return state;
  }
}
