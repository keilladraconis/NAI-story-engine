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
};
