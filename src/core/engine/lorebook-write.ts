// The one door through which every Engine write to a lorebook entry passes.
//
// Two things in a fixed order, and the order is the whole of the module:
//
//   1. READ the live entry. §5: a hand-edit made thirty seconds ago is simply
//      part of the input, and no Redux state claims authority over what an
//      entry currently says. This extends CLAUDE.md's DRAFT > LOREBOOK > STATE
//      across time as well as across surfaces. The door is the only reader, so
//      a caller cannot hand in a copy it fetched earlier — it is given the live
//      entry and produces its patch from that.
//   2. WRITE the patch it produced.
//
// There used to be two more steps: a write-once snapshot of the entry as the
// writer left it, and an `lb:` record of what the Engine wrote, so that history
// navigation could tell the Engine's edits from the writer's. Story Engine's
// records move forward only now, and "lorebook entries revert with story
// history" belongs to a separate script that needs no World and no Engine.
//
// `execute.test.ts`'s source scan holds every other module in this directory to
// coming through here, which is what makes read-then-write a property of the
// Engine rather than of the paths that happened to remember it.

/** Produces the patch to apply, from the live entry it is handed. Returning
 *  null declines the write — a refused generation must not blank an entry. */
export type LorebookEdit = (
  live: LorebookEntry,
) => Partial<LorebookEntry> | null | Promise<Partial<LorebookEntry> | null>;

/** Read live, then write. Returns whether a write actually landed.
 *
 *  Everything the Engine writes to a lorebook entry goes through here — revise,
 *  condense, the condition rebuild and the retire flag flip alike. A path that
 *  called `updateEntry` itself would be free to produce its patch from a copy
 *  of the entry fetched before a generation ran, which is the one thing §5
 *  forbids: the entry the model is shown must be the entry as it stands.
 *
 *  The error is rethrown rather than swallowed: the pass classifies failures
 *  (retryable or not) and the HUD reports them, and a door that reported
 *  success for a write that did not happen would be lying to both. */
export async function writeLorebookEntry(
  entryId: string,
  edit: LorebookEdit,
): Promise<boolean> {
  const live = await api.v1.lorebook.entry(entryId);
  // The writer deleted it. Recreating it here would resurrect exactly what
  // they removed.
  if (!live) return false;

  const patch = await edit(live);
  if (!patch) return false;

  await api.v1.lorebook.updateEntry(entryId, patch);
  return true;
}
