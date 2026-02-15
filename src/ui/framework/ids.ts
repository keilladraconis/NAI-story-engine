export const IDS = {
  CRUCIBLE: {
    WINDOW_ROOT: "cr-root",
    PHASE_TEXT: "cr-phase",
    STATUS_TEXT: "cr-status",
    GOALS_BTN: "cr-goals-btn",
    CHAIN_BTN: "cr-chain-btn",
    MERGE_BTN: "cr-merge-btn",
    STOP_BTN: "cr-stop-btn",
    COMMIT_BTN: "cr-commit-btn",
    RESET_BTN: "cr-reset-btn",
    CHECKPOINT_ROW: "cr-checkpoint-row",
    CHECKPOINT_TEXT: "cr-checkpoint-text",
    GOALS_LIST: "cr-goals-list",
    CHAIN_STATUS: "cr-chain-status",
    BEATS_LIST: "cr-beats-list",
    CONSTRAINTS_LIST: "cr-constraints-list",
    ELEMENTS_LIST: "cr-elements-list",
    MERGED_LIST: "cr-merged-list",
    EMPTY_STATE: "cr-empty",
    goal: (id: string) => ({
      ROOT: `cr-goal-${id}`,
      TEXT: `cr-goal-${id}-text`,
      TOGGLE: `cr-goal-${id}-toggle`,
    }),
  },
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
    CONTENT_INPUT: "lb-content-input",
    KEYS_INPUT: "lb-keys-input",
    GEN_CONTENT_BTN: "lb-gen-content-btn",
    GEN_KEYS_BTN: "lb-gen-keys-btn",
    REFINE_BTN: "lb-refine-btn",
    REFINE_INSTRUCTIONS_INPUT: "lb-refine-instructions",

    // Storage keys for streaming drafts
    // Raw keys for storyStorage.set/get calls
    CONTENT_DRAFT_RAW: "lb-draft-content",
    KEYS_DRAFT_RAW: "lb-draft-keys",
    REFINE_INSTRUCTIONS_RAW: "lb-refine-instructions",
    // Prefixed keys for storageKey binding on UI inputs
    CONTENT_DRAFT_KEY: "story:lb-draft-content",
    KEYS_DRAFT_KEY: "story:lb-draft-keys",
    REFINE_INSTRUCTIONS_KEY: "story:lb-refine-instructions",

    // Entry-specific IDs (for synchronization with LorebookIconButton)
    entry: (entryId: string) => ({
      CONTENT_REQ: `lb-item-${entryId}-content`,
      KEYS_REQ: `lb-item-${entryId}-keys`,
      REFINE_REQ: `lb-item-${entryId}-refine`,
    }),
  },
};
