# Scenario Build writes for real: no draft pool, undo per turn, one card

Date: 2026-10-08. Amends `2026-10-08-scenario-plan-build-design.md` and
`2026-10-07-scenario-chat-design.md`. Target version stays 0.15.0.

## Why

Plan is now where the writer deliberates, so a second approval step after
Build (draft, then Cast or Discard) is redundant. Threads already skip it: a
Build `THREAD` gets its lorebook entry at once, which is why Threads never fit
the entity-card design. The chat also shows each built entity twice, as a pill
and as a card, and shows Threads only as pills.

This spec drops the Scenario draft stage, keeps the `WorldEntity` record, adds
undo per Build reply, and renders one thing per command.

## Out of scope

- What text fills a new lorebook entry (the parked JIT-fleshing work). A new
  entry is created empty, as Cast creates it today.
- Removing the `WorldEntity` record or the summary/entry-text separation.
- The World panel's "+ Add Entity" form. It stays a draft until Save.
- The review pass and Thread admission.

## 1. What Build does

### CREATE

- Creates a **live** entity and binds its lorebook entry in the same turn,
  with Cast's rules: an unmanaged entry whose `displayName` matches
  (case-insensitive) is bound and moved to the `SE:` category; otherwise a new
  entry is created with `text: ""`, `keys: [nameKey(name)]`, `enabled: true`.
- The entity keeps `sourceChatId`. A non-empty `sourceChatId` means "a
  Scenario chat made this", and is what permits a delete. It no longer scopes
  anything to one chat.
- `REVISE` of an unknown name still creates (find-or-create), as a live
  CHARACTER.
- Command execution becomes asynchronous, since binding calls the lorebook
  API. Commands in one reply run in order, each awaited.

### REVISE, RENAME

- Allowed on any entity. `REVISE` writes the summary only. `RENAME` writes the
  entity name and the bound entry's `displayName`.

### DELETE

- Allowed only when the entity has a `sourceChatId`. It deletes the entity and
  removes its lorebook entry. Otherwise it is rejected with a repair reason
  ("was not built here and cannot be deleted from the chat").

### THREAD

- Unchanged.

### Context shown to the model

- `[POOL]` and `[LIVE]` merge into one `[WORLD]` block, grouped by category,
  `Name: summary`. Entities Build may delete carry a marker; the prompt says
  what the marker means.
- `[TOMBSTONES]` is removed. `[THREADS]` and `[REJECTED LAST TURN]` stay.
- `SCENARIO_BUILD_PROMPT` and `SCENARIO_PLAN_PROMPT` are reworded for
  `[WORLD]`; the Build prompt's "Only drafts under [POOL] may be revised,
  renamed or deleted" becomes the rule above. The probe's copy is regenerated,
  and the probe sends `SCENARIO_BUILD_PREFILL` as the app does.

### Removed

- Cast and Discard: `ForgeCommitBar`, `forgeCastAllRequested`,
  `forgeDiscardAllRequested`, `entityCastRequested` and
  `entityDiscardRequested` for Scenario drafts, and the discard control on a
  Scenario entity's card. A manual draft's discard (no `sourceChatId`) stays.
- Tombstones (`slices/forge.ts` tombstone state, `formatTombstones`,
  `REASON.discarded`).
- The reference scrub: `scrubQueued`, `runPendingScrub`,
  `buildForgeCleanupStrategy`, `forgeCleanupHandler`, `FORGE_CLEANUP_PROMPT`,
  the `forgeCleanup` target, and `messageKind: "cleanup"`.
- `draftsReleasedFromChat` and the pool selectors. Deleting a chat leaves
  what it built in the World.
- `REASON.live`.

If `slices/forge.ts` holds nothing after this, it is deleted.

## 2. Undo

### Record

Each applied command stores its reverse on its `ForgeActionRecord` (`undo`):

| Command                       | Reverse data                                                                                                                        |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| CREATE (and REVISE-as-create) | entity id; whether the entry was created or an existing one was bound                                                               |
| REVISE                        | entity id, previous summary, the summary written                                                                                    |
| RENAME                        | entity id, previous name, the name written                                                                                          |
| DELETE                        | the whole entity; the entry's `displayName`, `text`, `keys`, `enabled`, `forceActivation`, category; the Threads it was a member of |
| THREAD (new)                  | thread id                                                                                                                           |
| THREAD (rewrite)              | thread id; previous state, latent, wish; the values written                                                                         |

A THREAD rewrite stores its previous and written values positionally, as
`before: [state, private, wish]` and `wrote: [state, private, wish]`, so the
record type names neither field. Only `handlers/forge-chat.ts`, which is
already allowed to name both, reads and writes them; the undo logic lives
there. The privacy allow-lists are not extended. These values sit in the chat
slice beside the transcript, which already carries them as text.

### Undo turn

- `scenarioTurnUndoRequested({ chatId, messageId })` plays the reply's
  records in reverse order, then sets `ChatMessage.undone = true`.
- **Skip if changed since.** A REVISE, RENAME or THREAD rewrite is reversed
  only if the current value still equals the value the command wrote.
  Otherwise that record is skipped and its pill says so.
- A created entity is removed even if edited since. Its entry is removed if
  Build created it, and only unbound if Build bound an existing one. A created
  Thread is removed, and its entry switched off as when a Thread is deleted in
  the World.
- A deleted entity is restored with its entry and its Thread memberships.
- Undo is refused while any request for the chat is queued or running.

### Which reply

- Only the latest Build reply with at least one applied command and
  `undone !== true` shows the control. Undoing it exposes the one before.

### Retry

- Retrying a Build reply undoes it first, then prunes and re-runs. If it is
  not the latest undoable Build reply, Retry is refused and a short system
  note says to undo the later turns first.

### Later turns

- `scenarioConversation` and `formatRejections` leave out an undone reply.

### Limits (stated in the UI's title text)

- Separate from NovelAI's undo.
- Lorebook content generated for an entity after Build created it is lost if
  that create is undone.

## 3. The chat view

### One list

- A Build reply is one wrapping list of collapsed pills in written order.
  "Undo turn" sits in the reply's header beside Edit, Retry and Delete; it is
  always mounted and hidden by `display` when it does not apply.
- Labels: `thinking`, `+ <type> | Name`, `~ revised | Name`,
  `+ thread | Title`, `~ thread | Title`, `rename | "Old" → "New"`,
  `− deleted | Name`, `unrecognised`. Rejected pills are struck through with
  the repair line inside. On an undone reply, each pill whose command was reversed is struck through; one that undo left alone (changed since) keeps its card and says so.
- The inline `EntityCard` block under a reply and `inlineEntityIdsFor` are
  removed.

### What a pill opens into

- **Entity pill:** the World panel's `EntityCard` for that entity id, in
  place. A REVISE pill also shows the text it replaced beneath the card.
- **Thread pill:** the World panel's `ThreadItem` for that thread id. The
  chat adds no code that names private notes or wish.
- **Thinking, rename, delete, rejected:** text, as now.
- **Target gone** (undone or deleted since): what the command wrote
  (`ForgeActionRecord.body`).

The action record gains the target id (`entityId` / `threadId`) so the pill
can find the live thing. Per the renderer's rule, both the card and the
written-text fallback are mounted and toggled by `display`; a card for a
missing id renders nothing.

### Below the chat

- The Cast drafts / Discard drafts bar is gone.

### Entity card

- `EntityCard` loses its Scenario-draft discard branch. Border kinds and the
  World's "draft" grouping keep working for manual drafts.

## Error handling

- A lorebook call that throws during CREATE rejects that command with the
  error as its reason; the entity is not created. Later commands still run.
- A lorebook call that throws during undo leaves that record un-reversed,
  marks its pill, and does not set `undone`; the control stays.
- A Build reply that is cancelled, failed or edited executes nothing and has
  no undo records, as today.

## Testing

Unit tests: CREATE is live and binds (new entry; existing unmanaged entry);
the DELETE permission; each command's reverse; reverse order; skip-if-changed;
created-then-edited is still removed; bound-not-created entry is unbound, not
removed; undone replies leave the transcript and the rejections block; only
the latest reply is undoable; Retry undoes first and is refused out of order;
`[WORLD]` formatting and the marker. The privacy tests pass with their
allow-lists unchanged. The probe parity test covers the regenerated prompt.

In NovelAI, after a build, in a chat created for the test: pills open into
cards and Thread rows; a created entity has a lorebook entry; Undo removes it;
a revise is restored; Retry does not double-apply.

## Documents

- `CLAUDE.md`: the Scenario chat and Entity system sections.
- `CHANGELOG.md` `[0.15.0]`: written as the 0.14→0.15 change. Where 0.14
  shipped Cast and Discard, their removal is listed under Removed; nothing
  that existed only during 0.15 development is mentioned.
