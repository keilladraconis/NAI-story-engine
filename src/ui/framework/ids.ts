export const IDS = {
  BRAINSTORM: {
    ROOT: "se-bs-root",
    LIST: "se-bs-list",
    INPUT: "se-bs-input",
    SEND_BTN: "se-bs-send-btn",

    message: (id: string) => ({
      ROOT: `se-bs-msg-${id}`,
      VIEW: `se-bs-msg-${id}-view`,
      EDIT: `se-bs-msg-${id}-edit`,
      TEXT: `se-bs-msg-${id}-text`,
      INPUT: `se-bs-msg-${id}-input`,
    }),
  },
  LOREBOOK: {
    PANEL: "kse-lorebook-panel",
    CONTAINER: "lb-container",
    EMPTY_STATE: "lb-empty-state",
    NOT_MANAGED: "lb-not-managed",
    MAIN_CONTENT: "lb-main-content",
    ENTRY_NAME: "lb-entry-name",
    CONTENT_TEXT: "lb-content-text",
    KEYS_TEXT: "lb-keys-text",
    GEN_CONTENT_BTN: "lb-gen-content-btn",
    GEN_KEYS_BTN: "lb-gen-keys-btn",
  },
};
