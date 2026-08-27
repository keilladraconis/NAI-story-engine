// Framework-neutral storage-key + shared-slot registry.
//
// These are the only string keys that cross the core ↔ UI boundary: storyStorage
// slots that a core effect/strategy writes and the JSX UI reads (or vice-versa).
// Relocated out of the retired SUI `ui/framework/ids.ts` so `core/` no longer
// depends on the UI tree. The JSX layer imports the same constants instead of
// re-declaring bare copies.

/** storyStorage keys accessed directly via `storyStorage.get/set`. */
export const STORAGE_KEYS = {
  // The World and the story fields — one record, read and written only through
  // src/core/store/persistence/story-store.ts. Deliberately NOT the pre-0.15
  // `kse-persist` name: that blob carried a different set of slices, and alpha
  // does no migrations, so reusing the name would half-read it instead of
  // starting clean.
  WORLD: "kse-world",
  // Chat sessions — their own record because brainstorms follow the writer
  // rather than the World's shape, and a chat message must not rewrite the
  // World record on every keystroke's debounce.
  CHAT: "kse-chat",
  // Foundation — its own record too. It is the story's premise rather than
  // something the Engine keeps notes about: Shape, Intent and Contract describe
  // the whole thing, and ATTG/Style mirror into Memory and Author's Note.
  FOUNDATION: "kse-foundation",
  // Setting field.
  SETTING: "kse-setting",
  // Engine settings — one record holding all of them, rather than project.yaml
  // entries: api.v1.config is read-only (`get`, no `set`) and the Setup tab has
  // to be able to write these back, which is what makes them per story. Read
  // and written through src/core/engine/settings.ts, never raw: the slot is
  // validated on every read.
  ENGINE_SETTINGS: "kse-engine",
  // Forge guidance draft.
  FORGE_GUIDANCE_UI: "se-forge-guidance",
  // Opening Scene direction draft (the modal's textarea).
  OPENING_GUIDANCE: "se-opening-guidance",
  // Unsent chat composer text, as a { [chatId]: string } blob.
  COMPOSER_DRAFTS: "kse-composer-drafts",
};

// Edit-pane draft slots. The JSX EntityEditPane mirrors the live pane values
// here; lorebook/summary strategies read them as the DRAFT layer (DRAFT >
// LOREBOOK > STATE).
export const EDIT_PANE_TITLE = "kse-edit-title";
export const EDIT_PANE_CONTENT = "kse-edit-content";

// Lorebook streaming draft slots (content + keys) shared by generation handlers,
// the refine flow, and the JSX entity edit pane.
export const LB_CONTENT_DRAFT = "lb-draft-content";
export const LB_KEYS_DRAFT = "lb-draft-keys";

// How long a lorebook entry was the last time the Engine ATTEMPTED to condense
// it (§5.1), in characters. storyStorage: it is a fact about a lorebook entry,
// and the lorebook is global story state.
//
// This is the trigger's memory, and it exists because the trigger is otherwise
// memoryless: it fires on length alone, so an entry whose facts genuinely do
// not fit under the threshold would be condensed on every pass forever, each
// attempt spending §3.3's one entry rewrite and each one dropping a little
// more. With the mark, an entry must accumulate another paragraph past its last
// attempt before it is offered again — so a condense happens once per episode
// of bloat rather than once per pass.
//
// Written on a DECLINED attempt as well as a successful one, and the mark is
// the length of what the entry held at the time either way: a condense the
// model could not usefully perform is not one to retry three paragraphs early.
//
// Written and read only by `src/core/engine/condense.ts`.
export const lorebookCondensedKey = (entryId: string): string =>
  `kse-lb-condensed-${entryId}`;

// Generation-request tracking ids for an entity — all keyed by the ENTITY id (the
// generation TARGET stays the lorebook entry; these are only the tracking tokens).
// The card regen bolt, the edit pane, and SEGA all build ids from these, so a
// generation started on one surface is visible to the others — the zap disables
// and a second click can't launch a concurrent generation into the same entry.
// Keep these the single source of the scheme; scattered literals are what let the
// card and pane drift apart (the bug this fixes).
export const entitySummaryRequestId = (entityId: string): string =>
  `se-entity-summary-${entityId}`;
export const entitySummaryBindRequestId = (entityId: string): string =>
  `entity-summary-bind-${entityId}`;
export const lorebookContentRequestId = (entityId: string): string =>
  `lb-entity-${entityId}-content`;
export const lorebookKeysRequestId = (entityId: string): string =>
  `lb-entity-${entityId}-keys`;
