export const IDS = {
  CRUCIBLE: {
    WINDOW_ROOT: "cr-root",
    STATUS_TEXT: "cr-status",
    RESET_BTN: "cr-reset-btn",
    GOALS_LIST: "cr-goals-list",
    INTENT_BTN: "cr-intent-btn",
    INTENT_SECTION: "cr-intent-section",
    INTENT_TEXT: "cr-intent-text",
    STREAM_TEXT: "cr-stream-text",
    ADD_GOAL_BTN: "cr-add-goal-btn",
    CLEAR_GOALS_BTN: "cr-clear-goals-btn",
    SOLVER_BODY: "cr-solver-body",
    CONSTRAINTS_ROOT: "cr-constraints-root",
    OPEN_LIST: "cr-constraints-open",
    RESOLVED_LIST: "cr-constraints-resolved",
    CONSTRAINT_INPUT: "cr-constraint-input",
    CONSTRAINT_ADD_BTN: "cr-constraint-add-btn",
    DIRECTOR_ROOT: "cr-director-root",
    DIRECTOR_TEXT: "cr-director-text",
    BUILDER_ROOT: "cr-builder-root",
    goal: (id: string) => ({
      ROOT: `cr-goal-${id}`,
      TEXT: `cr-goal-${id}-text`,
      DEL_BTN: `cr-goal-${id}-del`,
      GEN_BTN: `cr-goal-${id}-gen`,
      BUILD_BTN: `cr-goal-${id}-build`,
    }),
    beat: (goalId: string, beatIndex: number) => ({
      ROOT: `cr-beat-${goalId}-${beatIndex}`,
      TEXT: `cr-beat-${goalId}-${beatIndex}-text`,
      FAV_BTN: `cr-beat-${goalId}-${beatIndex}-fav`,
      FORK_BTN: `cr-beat-${goalId}-${beatIndex}-fork`,
      DEL_BTN: `cr-beat-${goalId}-${beatIndex}-del`,
    }),
    GOAL_SECTION: (goalId: string) => `cr-goal-section-${goalId}`,
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
