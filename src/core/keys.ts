// Framework-neutral storage-key + shared-slot registry.
//
// These are the only string keys that cross the core ↔ UI boundary: storyStorage
// slots that a core effect/strategy writes and the JSX UI reads (or vice-versa).
// Relocated out of the retired SUI `ui/framework/ids.ts` so `core/` no longer
// depends on the UI tree. The JSX layer imports the same constants instead of
// re-declaring bare copies.

/** storyStorage keys accessed directly via `storyStorage.get/set`. */
export const STORAGE_KEYS = {
  // Chat sessions — storyStorage, not historyStorage: brainstorms follow the
  // writer, not the branch (design §6.1). The World and story fields live in
  // historyStorage under the keyspace in
  // src/core/store/persistence/keyspace.ts.
  CHAT: "kse-chat",
  // Foundation — storyStorage too. It is the story's premise, not a property of
  // any one point in it: Shape, Intent and Contract describe the whole thing,
  // and ATTG/Style mirror into Memory and Author's Note, which are themselves
  // story-global. Branch-scoping it made undo revert the Foundation while
  // Memory kept the newer text, so what the writer saw and what reached the
  // model disagreed.
  FOUNDATION: "kse-foundation",
  // Setting field.
  SETTING: "kse-setting",
  // Engine settings — one record holding all three, in storyStorage rather than
  // historyStorage because "is the Engine on" is a property of the story, not of
  // a point in it: undoing three paragraphs must not switch the Engine off. Not
  // in project.yaml either, because api.v1.config is read-only (`get`, no `set`)
  // and the Setup tab has to be able to write these back — which is what makes
  // them per story. Read and written through src/core/engine/settings.ts, never
  // raw: the slot is validated on every read.
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

// The write-once original of a lorebook entry the Engine has edited (design
// §5.2). storyStorage, not historyStorage: it is about the story as a whole,
// and an original that moved with the branch would be missing on exactly the
// branch the writer wants it back on.
//
// One key per entry rather than one blob, because the record is written with
// `storyStorage.setIfAbsent` — write-once is then a property of the API call
// rather than of a read-then-write the next caller can get wrong, and a blob
// would have to be rewritten whole on every first touch.
//
// Written only by `src/core/engine/lorebook-write.ts`, and read by nothing yet:
// §5.2 is explicit that the loop never consults the snapshot, so this key
// exists for a restore surface a later phase builds.
export const lorebookOriginalKey = (entryId: string): string =>
  `kse-lb-original-${entryId}`;

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
