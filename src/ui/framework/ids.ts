// ─── storyStorage key conventions ────────────────────────────────────────────
// "story:" prefix  — UI/layout state persisted automatically by NAI's storageKey
//                    binding on inputs/collapsibles; NOT managed by reset effects.
// "cr-"    prefix  — Crucible content managed manually; cleared by crucibleReset.
// (no prefix)      — Misc keys accessed directly via storyStorage.get/set.
// ─────────────────────────────────────────────────────────────────────────────

// Shared draft key for the singleton editable pattern
export const EDITABLE_DRAFT_RAW = "kse-editable-draft"; // for storyStorage.get/set
export const EDITABLE_DRAFT_KEY = "kse-editable-draft"; // for multilineTextInput storageKey (add story: at binding site)

// Edit pane draft keys (ContentWithTitle / SimpleContent)
export const EDIT_PANE_TITLE = "kse-edit-title"; // storyStorage.get/set + storageKey binding
export const EDIT_PANE_CONTENT = "kse-edit-content"; // storyStorage.get/set + storageKey binding

/**
 * Centralized storage key registry.
 * Raw keys are for `storyStorage.get/set` calls.
 * Keys with `story:` prefix are for UI `storageKey` bindings.
 */
export const STORAGE_KEYS = {
  // Core persistence
  PERSIST: "kse-persist",

  // Setting (Crucible reads this too)
  SETTING: "kse-setting",
  SETTING_UI: "kse-setting",

  // Sync toggles
  SYNC_ATTG_MEMORY: "kse-sync-attg-memory",
  SYNC_STYLE_MEMORY: "kse-sync-style-memory",

  // Field content & sections (dynamic by fieldId)
  field: (fieldId: string) => `kse-field-${fieldId}`,
  fieldUI: (fieldId: string) => `kse-field-${fieldId}`,
  sectionUI: (fieldId: string) => `kse-section-${fieldId}`,

  // DULFS list items (dynamic by itemId)
  dulfsItem: (itemId: string) => `dulfs-item-${itemId}`,
  dulfsItemUI: (itemId: string) => `dulfs-item-${itemId}`,

  brainstormInputUI: (inputId: string) => inputId,

  // Forge UI
  FORGE_GUIDANCE_UI: "se-forge-guidance",
};

export const IDS = {
  FOUNDATION: {
    SECTION: "se-fn-section",
    SHAPE_CARD: "se-fn-shape-card",
    SHAPE_BTN: "se-fn-shape-btn",
    INTENT_TEXT: "se-fn-intent",
    INTENT_BTN: "se-fn-intent-btn",
    WORLD_STATE_TEXT: "se-fn-world-state",
    WORLD_STATE_BTN: "se-fn-world-state-btn",
    INTENSITY_CARD: "se-fn-intensity-card",
    CONTRACT_CARD: "se-fn-contract-card",
    CONTRACT_BTN: "se-fn-contract-btn",
    ATTG_INPUT: "se-fn-attg",
    ATTG_GEN_BTN: "se-fn-attg-gen",
    STYLE_INPUT: "se-fn-style",
    STYLE_GEN_BTN: "se-fn-style-gen",
  },
  entity: (id: string) => ({
    ROOT: `se-entity-${id}`,
    REGEN_BTN: `se-entity-${id}-regen`,
    DELETE_BTN: `se-entity-${id}-delete`,
  }),
  FORGE: {
    SECTION: "se-forge-section",
    GUIDANCE_INPUT: "se-forge-guidance",
    FORGE_BTN: "se-forge-btn",
    BRAINSTORM_BTN: "se-forge-brainstorm-btn",
    TICKER: "se-forge-ticker",
    CLEAR_BTN: "se-forge-clear-btn",
  },
  WORLD: {
    SECTION: "se-world-section",
    BODY: "se-world-body",
    thread: (id: string) => ({
      SECTION: `se-world-thread-${id}`,
      TITLE_INPUT: `se-world-thread-${id}-title`,
      SUMMARY_INPUT: `se-world-thread-${id}-summary`,
      ENTITY_LIST: `se-world-thread-${id}-entities`,
      DELETE_BTN: `se-world-thread-${id}-delete`,
      LOREBOOK_BTN: `se-world-thread-${id}-lorebook`,
    }),
  },
  IMPORT: {
    WIZARD: "se-import-wizard",
    ATTG_ROW: "se-import-attg-row",
    ATTG_BTN: "se-import-attg-btn",
    STYLE_ROW: "se-import-style-row",
    STYLE_BTN: "se-import-style-btn",
    ANALYZE_ROW: "se-import-analyze-row",
    ANALYZE_BTN: "se-import-analyze-btn",
    IMPORT_ALL_BTN: "se-import-all-btn",
    BODY: "se-import-body",
    entry: (entryId: string) => ({
      ROW: `se-import-entry-${entryId}`,
      CAT_BTN: `se-import-entry-cat-${entryId}`,
      BIND_BTN: `se-import-entry-bind-${entryId}`,
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
  EDIT_PANE: {
    ROOT: "se-edit-pane",
    BACK_BTN: "se-edit-back",
    LABEL: "se-edit-label",
    TITLE_INPUT: "se-edit-title",
    CONTENT_INPUT: "se-edit-content",
    SAVE_BTN: "se-edit-save",
    DELETE_BTN: "se-edit-delete",
  },
  LOREBOOK: {
    PANEL: "kse-lorebook-panel",
    CONTAINER: "lb-container",
    EMPTY_STATE: "lb-empty-state",
    NOT_MANAGED: "lb-not-managed",
    MAIN_CONTENT: "lb-main-content",
    ENTRY_NAME: "lb-entry-name",
    LIFECYCLE_BADGE: "lb-lifecycle-badge",
    CONTENT_INPUT: "lb-content-input",
    KEYS_INPUT: "lb-keys-input",
    GEN_CONTENT_BTN: "lb-gen-content-btn",
    GEN_KEYS_BTN: "lb-gen-keys-btn",
    REFINE_BTN: "lb-refine-btn",
    REFINE_INSTRUCTIONS_INPUT: "lb-refine-instructions",

    // Action buttons (managed view)
    UNBIND_BTN: "lb-unbind-btn",

    // Bind view (unmanaged)
    BIND_BTN: "lb-bind-btn",
    CATEGORY_BTN: "lb-category-btn",

    // Storage keys for streaming drafts (same key used for both storyStorage and storageKey binding)
    CONTENT_DRAFT_RAW: "lb-draft-content",
    KEYS_DRAFT_RAW: "lb-draft-keys",
    REFINE_INSTRUCTIONS_RAW: "lb-refine-instructions",
    CONTENT_DRAFT_KEY: "lb-draft-content",
    KEYS_DRAFT_KEY: "lb-draft-keys",
    REFINE_INSTRUCTIONS_KEY: "lb-refine-instructions",

    // Always On toggle (edit pane)
    ALWAYS_ON_TOGGLE: "lb-always-on-toggle",

    // Entry-specific IDs (for synchronization with LorebookIconButton)
    entry: (entryId: string) => ({
      CONTENT_REQ: `lb-item-${entryId}-content`,
      KEYS_REQ: `lb-item-${entryId}-keys`,
      REFINE_REQ: `lb-item-${entryId}-refine`,
    }),

  },
};
