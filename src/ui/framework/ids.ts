// ─── storyStorage key conventions ────────────────────────────────────────────
// "story:" prefix  — UI/layout state persisted automatically by NAI's storageKey
//                    binding on inputs/collapsibles; NOT managed by reset effects.
// "cr-"    prefix  — Crucible content managed manually; cleared by crucibleReset.
// (no prefix)      — Misc keys accessed directly via storyStorage.get/set.
// ─────────────────────────────────────────────────────────────────────────────

// Shared draft key for the singleton editable pattern
export const EDITABLE_DRAFT_RAW = "kse-editable-draft"; // for storyStorage.get/set
export const EDITABLE_DRAFT_KEY = "story:kse-editable-draft"; // for multilineTextInput storageKey

/**
 * Centralized storage key registry.
 * Raw keys are for `storyStorage.get/set` calls.
 * Keys with `story:` prefix are for UI `storageKey` bindings.
 */
export const STORAGE_KEYS = {
  // Core persistence
  PERSIST: "kse-persist",
  JOURNAL: "kse-gen-journal",

  // Setting (Crucible reads this too)
  SETTING: "kse-setting",
  SETTING_UI: "story:kse-setting",

  // Sync toggles
  SYNC_ATTG_MEMORY: "kse-sync-attg-memory",
  SYNC_ATTG_MEMORY_UI: "story:kse-sync-attg-memory",
  SYNC_STYLE_AN: "kse-sync-style-an",
  SYNC_STYLE_AN_UI: "story:kse-sync-style-an",

  // Field content & sections (dynamic by fieldId)
  field: (fieldId: string) => `kse-field-${fieldId}`,
  fieldUI: (fieldId: string) => `story:kse-field-${fieldId}`,
  sectionUI: (fieldId: string) => `story:kse-section-${fieldId}`,

  // DULFS list items (dynamic by itemId)
  dulfsItem: (itemId: string) => `dulfs-item-${itemId}`,
  dulfsItemUI: (itemId: string) => `story:dulfs-item-${itemId}`,

  brainstormInputUI: (inputId: string) => `story:${inputId}`,

  // Crucible content
  CR_SHAPE_NAME: "cr-shape-name",
  CR_SHAPE_NAME_UI: "story:cr-shape-name",
  CR_BUILD_GUIDANCE: "cr-build-guidance",
  CR_BUILD_GUIDANCE_UI: "story:cr-build-guidance",

  // Crucible UI collapse states (raw + story: prefixed)
  CR_SHAPE_COLLAPSED: "cr-shape-collapsed",
  CR_SHAPE_COLLAPSED_UI: "story:cr-shape-collapsed",
  CR_DIRECTION_COLLAPSED: "cr-direction-collapsed",
  CR_DIRECTION_COLLAPSED_UI: "story:cr-direction-collapsed",
  CR_TENSIONS_COLLAPSED: "cr-tensions-collapsed",
  CR_TENSIONS_COLLAPSED_UI: "story:cr-tensions-collapsed",
  CR_LINKS_SECTION_UI: "story:cr-links-section",
  CR_ELEMENTS_SECTION_UI: "story:cr-elements-section",
  CR_BUILD_LOG_COLLAPSED_UI: "story:cr-build-log-collapsed",
};

export const IDS = {
  CRUCIBLE: {
    WINDOW_ROOT: "cr-root",
    STATUS_TEXT: "cr-status",
    RESET_BTN: "cr-reset-btn",
    TENSIONS_LIST: "cr-tensions-list",
    DIRECTION_BTN: "cr-direction-btn",
    DIRECTION_SECTION: "cr-direction-section",
    DIRECTION_TEXT: "cr-direction-text",
    TICKER_TEXT: "cr-ticker",
    SHAPE_SECTION: "cr-shape-section",
    SHAPE_NAME: "cr-shape-name",
    SHAPE_TEXT: "cr-shape-text",
    SHAPE_BTN: "cr-shape-btn",
    ELEMENTS_SECTION: "cr-elements",
    MERGE_BTN: "cr-merge-btn",
    // Build pass
    BUILD_PASS_ROOT: "cr-build-root",
    BUILD_GUIDANCE_INPUT: "cr-build-guidance",
    BUILD_PASS_BTN: "cr-build-pass-btn",
    BUILD_LOG: "cr-build-log",
    BUILD_WORLD_SUMMARY: "cr-build-world-summary",
    // Dynamic ID helpers
    tension: (id: string) => ({
      ROOT: `cr-tension-${id}`,
      TEXT: `cr-tension-${id}-text`,
      DEL_BTN: `cr-tension-${id}-del`,
    }),
    element: (id: string) => ({
      ROOT: `cr-element-${id}`,
      TEXT: `cr-element-${id}-text`,
    }),
    link: (id: string) => ({
      ROOT: `cr-link-${id}`,
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
      TEXT: `se-bs-msg-${id}-text`,
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
    MAP_DRAFT_RAW: "lb-draft-relational-map",
    REFINE_INSTRUCTIONS_RAW: "lb-refine-instructions",
    // Prefixed keys for storageKey binding on UI inputs
    CONTENT_DRAFT_KEY: "story:lb-draft-content",
    KEYS_DRAFT_KEY: "story:lb-draft-keys",
    MAP_DRAFT_KEY: "story:lb-draft-relational-map",
    REFINE_INSTRUCTIONS_KEY: "story:lb-refine-instructions",

    // Entry-specific IDs (for synchronization with LorebookIconButton)
    entry: (entryId: string) => ({
      CONTENT_REQ: `lb-item-${entryId}-content`,
      MAP_REQ: `lb-item-${entryId}-relational-map`,
      KEYS_REQ: `lb-item-${entryId}-keys`,
      REFINE_REQ: `lb-item-${entryId}-refine`,
    }),
  },
};
