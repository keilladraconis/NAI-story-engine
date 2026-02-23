// Shared draft key for the singleton editable pattern
export const EDITABLE_DRAFT_RAW = "kse-editable-draft"; // for storyStorage.get/set
export const EDITABLE_DRAFT_KEY = "story:kse-editable-draft"; // for multilineTextInput storageKey

export const IDS = {
  CRUCIBLE: {
    WINDOW_ROOT: "cr-root",
    STATUS_TEXT: "cr-status",
    RESET_BTN: "cr-reset-btn",
    GOALS_LIST: "cr-goals-list",
    DIRECTION_BTN: "cr-direction-btn",
    DIRECTION_SECTION: "cr-direction-section",
    DIRECTION_TEXT: "cr-direction-text",
    ADD_GOAL_BTN: "cr-add-goal-btn",
    CLEAR_GOALS_BTN: "cr-clear-goals-btn",
    TICKER_TEXT: "cr-ticker",
    PROGRESS_ROOT: "cr-progress-root",
    REVIEW_ROOT: "cr-review-root",
    MERGED_ROOT: "cr-merged-root",
    STRUCTURAL_GOALS_SECTION: "cr-structural-goals",
    PREREQS_SECTION: "cr-prereqs",
    ELEMENTS_SECTION: "cr-elements",
    MERGE_BTN: "cr-merge-btn",
    goal: (id: string) => ({
      ROOT: `cr-goal-${id}`,
      TEXT: `cr-goal-${id}-text`,
      DEL_BTN: `cr-goal-${id}-del`,
    }),
    structuralGoal: (id: string) => ({
      ROOT: `cr-sg-${id}`,
      TEXT: `cr-sg-${id}-text`,
    }),
    prereq: (id: string) => ({
      ROOT: `cr-prereq-${id}`,
      TEXT: `cr-prereq-${id}-text`,
    }),
    element: (id: string) => ({
      ROOT: `cr-element-${id}`,
      TEXT: `cr-element-${id}-text`,
    }),
  },
  BRAINSTORM: {
    ROOT: "se-bs-root",
    LIST: "se-bs-list",
    INPUT: "se-bs-input",
    SEND_BTN: "se-bs-send-btn",
    HEADER: "se-bs-header",
    TITLE: "se-bs-title",
    NEW_BTN: "se-bs-new-btn",
    SESSIONS_BTN: "se-bs-sessions-btn",
    MODE_COWRITER_BTN: "se-bs-mode-cowriter",
    MODE_CRITIC_BTN: "se-bs-mode-critic",
    SUMMARIZE_BTN: "se-bs-summarize",
    sessionRow: (index: number) => `se-bs-session-${index}`,

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
