// src/ui/framework/ids.ts

/**
 * Deterministic ID generation for the UI.
 * Rules:
 * 1. IDs must be unique within the global scope.
 * 2. IDs must be derived from domain data (e.g. message IDs).
 * 3. IDs must be hierarchical.
 */

export const IDS = {
  // Global Sidebar
  SIDEBAR: "kse-sidebar",

  // Brainstorm Feature
  BRAINSTORM: {
    ROOT: "kse-brainstorm-root",
    LIST: "kse-brainstorm-list",
    INPUT: "kse-brainstorm-input",
    SEND_BTN: "kse-brainstorm-send-btn",
    CANCEL_BTN: "kse-brainstorm-cancel-btn",
    CLEAR_BTN: "kse-brainstorm-clear-btn",

    // Message specific IDs
    message: (msgId: string) => ({
      ROOT: `kse-bs-msg-${msgId}`,
      VIEW_CONTAINER: `kse-bs-msg-${msgId}-view`,
      EDIT_CONTAINER: `kse-bs-msg-${msgId}-edit`,
      TEXT_DISPLAY: `kse-bs-msg-${msgId}-text`,
      TEXT_INPUT: `kse-bs-msg-${msgId}-input`,
      ACTIONS: {
        EDIT: `kse-bs-msg-${msgId}-btn-edit`,
        SAVE: `kse-bs-msg-${msgId}-btn-save`,
        RETRY: `kse-bs-msg-${msgId}-btn-retry`,
        DELETE: `kse-bs-msg-${msgId}-btn-delete`,
      },
    }),
  },
};
