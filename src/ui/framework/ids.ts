// ─── storyStorage key conventions ────────────────────────────────────────────
// "story:" prefix  — UI/layout state persisted automatically by NAI's storageKey
//                    binding on inputs/collapsibles; NOT managed by reset effects.
// "cr-"    prefix  — Crucible content managed manually; cleared by crucibleReset.
// (no prefix)      — Misc keys accessed directly via storyStorage.get/set.
// ─────────────────────────────────────────────────────────────────────────────

// Shared draft key for the singleton editable pattern
export const EDITABLE_DRAFT_RAW = "kse-editable-draft"; // for storyStorage.get/set
export const EDITABLE_DRAFT_KEY = "kse-editable-draft"; // for multilineTextInput storageKey (add story: at binding site)

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
  SETTING_UI: "kse-setting",

  // Sync toggles
  SYNC_ATTG_MEMORY: "kse-sync-attg-memory",
  SYNC_ATTG_MEMORY_UI: "kse-sync-attg-memory",
  SYNC_STYLE_AN: "kse-sync-style-an",
  SYNC_STYLE_AN_UI: "kse-sync-style-an",

  // Field content & sections (dynamic by fieldId)
  field: (fieldId: string) => `kse-field-${fieldId}`,
  fieldUI: (fieldId: string) => `kse-field-${fieldId}`,
  sectionUI: (fieldId: string) => `kse-section-${fieldId}`,

  // DULFS list items (dynamic by itemId)
  dulfsItem: (itemId: string) => `dulfs-item-${itemId}`,
  dulfsItemUI: (itemId: string) => `dulfs-item-${itemId}`,

  brainstormInputUI: (inputId: string) => inputId,

  // Foundation UI (v11)
  FOUNDATION_SECTION_UI: "se-foundation-section",
  FOUNDATION_SHAPE_NAME_UI: "se-fn-shape-name",
  FOUNDATION_ATTG_UI: "se-foundation-attg",
  FOUNDATION_STYLE_UI: "se-foundation-style",

  // Forge UI (v11)
  FORGE_SECTION_UI: "se-forge-section",
  FORGE_GUIDANCE_UI: "se-forge-guidance",
  FORGE_BATCH_NAME_UI: "se-forge-batch-name",

  // Lorebook relationship add form
  REL_FORM_DESC: "lb-rel-form-desc",
  REL_FORM_DESC_UI: "lb-rel-form-desc",

  // World batch UI (v11) — dynamic by batchId
  worldBatchSectionUI: (batchId: string) => `se-world-batch-${batchId}`,
};

export const IDS = {
  FOUNDATION: {
    SECTION: "se-fn-section",
    SHAPE_NAME: "se-fn-shape-name",
    SHAPE_TEXT: "se-fn-shape",
    SHAPE_BTN: "se-fn-shape-btn",
    INTENT_TEXT: "se-fn-intent",
    INTENT_BTN: "se-fn-intent-btn",
    WORLD_STATE_TEXT: "se-fn-world-state",
    WORLD_STATE_BTN: "se-fn-world-state-btn",
    TENSIONS_LIST: "se-fn-tensions-list",
    ADD_TENSION_BTN: "se-fn-add-tension",
    ATTG_INPUT: "se-fn-attg",
    ATTG_GEN_BTN: "se-fn-attg-gen",
    STYLE_INPUT: "se-fn-style",
    STYLE_GEN_BTN: "se-fn-style-gen",
    tension: (id: string) => ({
      ROOT: `se-fn-tension-${id}`,
      TEXT: `se-fn-tension-${id}-text`,
      RESOLVE_BTN: `se-fn-tension-${id}-resolve`,
      DELETE_BTN: `se-fn-tension-${id}-del`,
    }),
  },
  // Entity IDs — qualified by lifecycle so draft/live instances are distinct parts.
  // This prevents the framework from conflating a live EntityCard with a reforged
  // (now-draft) one that shares the same entityId.
  entity: (id: string, lifecycle: "draft" | "live") => ({
    ROOT: `se-entity-${lifecycle}-${id}`,
    CAST_BTN: `se-entity-${lifecycle}-${id}-cast`,
    DISCARD_BTN: `se-entity-${lifecycle}-${id}-discard`,
    REFORGE_BTN: `se-entity-${lifecycle}-${id}-reforge`,
    REGEN_BTN: `se-entity-${lifecycle}-${id}-regen`,
    MOVE_BTN: `se-entity-${lifecycle}-${id}-move`,
    DELETE_BTN: `se-entity-${lifecycle}-${id}-delete`,
    LINKS_SECTION: `se-entity-${lifecycle}-${id}-links`,
    LINKS_LIST: `se-entity-${lifecycle}-${id}-links-list`,
    ADD_LINK_BTN: `se-entity-${lifecycle}-${id}-add-link`,
    NEW_LINK_INPUT: `se-entity-${lifecycle}-${id}-new-link-input`,
    NEW_LINK_KEY: `se-entity-new-link-${lifecycle}-${id}`,
    rel: (relId: string) => ({
      ROOT: `se-entity-${lifecycle}-${id}-rel-${relId}`,
      DELETE_BTN: `se-entity-${lifecycle}-${id}-rel-${relId}-del`,
    }),
  }),
  FORGE: {
    SECTION: "se-forge-section",
    GUIDANCE_INPUT: "se-forge-guidance",
    FORGE_BTN: "se-forge-btn",
    BRAINSTORM_BTN: "se-forge-brainstorm-btn",
    BATCH_NAME: "se-forge-batch-name",
    ENTITY_LIST: "se-forge-entity-list",
    TICKER: "se-forge-ticker",
    CAST_ALL_BTN: "se-forge-cast-all",
    DISCARD_ALL_BTN: "se-forge-discard-all",
    CLEAR_BTN: "se-forge-clear-btn",
    CAST_DISCARD_ROW: "se-forge-cast-discard-row",
  },
  WORLD: {
    BATCH_LIST: "se-world-batch-list",
    batch: (id: string) => ({
      SECTION: `se-world-batch-${id}`,
      ENTITY_LIST: `se-world-batch-${id}-entities`,
      REFORGE_BTN: `se-world-batch-${id}-reforge`,
      RENAME_INPUT: `se-world-batch-${id}-rename`,
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
    LIFECYCLE_BADGE: "lb-lifecycle-badge",
    CONTENT_INPUT: "lb-content-input",
    KEYS_INPUT: "lb-keys-input",
    GEN_CONTENT_BTN: "lb-gen-content-btn",
    GEN_KEYS_BTN: "lb-gen-keys-btn",
    REFINE_BTN: "lb-refine-btn",
    REFINE_INSTRUCTIONS_INPUT: "lb-refine-instructions",

    // Relationship section (managed view)
    RELATIONSHIPS_SECTION: "lb-rels-section",
    RELATIONSHIPS_LIST: "lb-rels-list",
    ADD_REL_BTN: "lb-add-rel-btn",
    REL_FORM: "lb-rel-form",
    REL_FORM_TARGET_BTN: "lb-rel-form-target",
    REL_FORM_DESC: "lb-rel-form-desc",
    REL_FORM_ADD_BTN: "lb-rel-form-add",
    REL_FORM_CANCEL_BTN: "lb-rel-form-cancel",

    // Action buttons (managed view)
    REFORGE_ENTITY_BTN: "lb-reforge-entity-btn",
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

    // Entry-specific IDs (for synchronization with LorebookIconButton)
    entry: (entryId: string) => ({
      CONTENT_REQ: `lb-item-${entryId}-content`,
      KEYS_REQ: `lb-item-${entryId}-keys`,
      REFINE_REQ: `lb-item-${entryId}-refine`,
    }),

    // Per-relationship IDs
    relationship: (relId: string) => ({
      ROOT: `lb-rel-${relId}`,
      DELETE_BTN: `lb-rel-${relId}-del`,
    }),
  },
};
