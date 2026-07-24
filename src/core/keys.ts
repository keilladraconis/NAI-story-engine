// Framework-neutral storage-key + shared-slot registry.
//
// These are the only string keys that cross the core ↔ UI boundary: storyStorage
// slots that a core effect/strategy writes and the JSX UI reads (or vice-versa).
// Relocated out of the retired SUI `ui/framework/ids.ts` so `core/` no longer
// depends on the UI tree. The JSX layer imports the same constants instead of
// re-declaring bare copies.

/** storyStorage keys accessed directly via `storyStorage.get/set`. */
export const STORAGE_KEYS = {
  // Core persistence blob.
  PERSIST: "kse-persist",
  // Setting field.
  SETTING: "kse-setting",
  // Forge guidance draft.
  FORGE_GUIDANCE_UI: "se-forge-guidance",
};

// Edit-pane draft slots. The JSX EntityEditPane mirrors the live pane values
// here; lorebook/summary strategies read them as the DRAFT layer (DRAFT >
// LOREBOOK > STATE).
export const EDIT_PANE_TITLE = "kse-edit-title";
export const EDIT_PANE_CONTENT = "kse-edit-content";

// Chat composer slot the `uiChatSubmitUserMessage` effect reads the message
// text from; the JSX ChatInput writes it just before dispatching.
export const CHAT_INPUT_KEY = "se-bs-input";

// Lorebook streaming draft slots (content + keys) shared by generation handlers,
// the refine flow, and the JSX entity edit pane.
export const LB_CONTENT_DRAFT = "lb-draft-content";
export const LB_KEYS_DRAFT = "lb-draft-keys";
