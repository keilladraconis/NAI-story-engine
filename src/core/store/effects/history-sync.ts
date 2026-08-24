// The single onHistoryNavigated registration.
//
// api.v1.hooks.register holds ONE callback per hook name, so this is the only
// place in the codebase that may register this hook — bootstrap-effects.ts used
// to, for historyEpoch, and that job moved here rather than competing for the
// slot. §7's reconciliation lands here for the same reason: it is a third thing
// that happens on a navigation, not a second callback that could have it.
//
// The hook fires only on explicit navigation (undo/redo/retry/jump), never for
// nodes created by ordinary editing or generation, so this is a
// branch-exploration signal rather than something that runs while writing.
//
// nodeId arrives as a number despite the .d.ts declaring string — corrected in
// src/type-overrides.d.ts, measured in design §12.1.
//
// Four things happen, in this order (§7's list, plus the flush phase 2 needed):
//
//   1. Re-derive anything keyed off document content.
//   2. Flush autosave onto the node it describes, before that node's state is
//      replaced underneath it.
//   3. Reload the branch-scoped slices at the target node and replace.
//   4. Reconcile the lorebook against the branch (§7).
//
// The watermark is not a step here, and §7's step 2 ("recompute the watermark")
// is answered elsewhere rather than built: `assess` treats a watermark whose
// section the document no longer holds as no watermark at all and re-reads the
// branch from the start. That is the same correction made lazily, at the one
// place that can act on it, and it also covers the branch the writer edited
// rather than navigated.

import type { AppDispatch, RootState } from "../types";
import { persistedDataLoaded } from "../index";
import { documentHistoryNavigated } from "../slices/runtime";
import { loadBranchState } from "../persistence/history-store";
import { createEngineLog, type EngineLog } from "../../engine/log";
import {
  listLorebookWriteRecords,
  writeLorebookEntry,
} from "../../engine/lorebook-write";
import {
  reconcileThreadEntries,
  reconcileWriteRecords,
  touchedOnBranch,
} from "../../engine/reconcile";
import { SE_THREAD_CATEGORY } from "../../engine/thread-bind";
import { engineTouchedRecounted } from "../slices/engine";
import type { AutosaveHandle } from "./autosave";

/** §7, performed: the decisions live in `reconcile.ts`, the I/O lives here.
 *
 *  **Nothing is read from a Redux slice.** The World this reconciles against is
 *  the one `loadBranchState` just returned for the target node, handed in — not
 *  `getState()`, which is a dispatch away from being the same thing and would
 *  make this depend on a reducer having already run.
 *
 *  **No settings read, and no Engine on/off check.** Everything below is scoped
 *  to entries the Engine's own category or the branch's own threads name, so a
 *  story the Engine never ran in has nothing to reconcile and this costs two
 *  lorebook reads. Gating it on `enabled` would instead mean a writer who
 *  switched the Engine off kept a lorebook that no longer follows their undo —
 *  the same argument that registers the thread-condition effects unconditionally.
 *
 *  **Every write goes through Task 1's door**, including this one: the flip
 *  takes the §5.2 snapshot on the way through, which for a thread entry is the
 *  first snapshot it has ever had (creation deliberately bypasses the door,
 *  having no live text to read).
 *
 *  Errors are logged rather than thrown. This runs inside a fire-and-forget hook
 *  where a rejection has nowhere to land, and a failed reconciliation leaves the
 *  lorebook exactly as the writer's last navigation left it. */
async function reconcileLorebook(
  nodeId: number,
  world: RootState["world"],
  dispatch: AppDispatch,
  log: EngineLog,
  stillCurrent: () => boolean,
): Promise<void> {
  const [records, entries, categories] = await Promise.all([
    listLorebookWriteRecords(nodeId),
    api.v1.lorebook.entries(),
    api.v1.lorebook.categories(),
  ]);
  // A held Ctrl+Z fires this per node it passes through, and each one would
  // otherwise write the flags its own node implies. Only the navigation the
  // writer actually landed on may act.
  if (!stillCurrent()) return;

  // §9.1's ∆, recounted from the branch. Free here — the records are already
  // read — and it is the number that slot has always claimed to be.
  const reconciled = reconcileWriteRecords(records, entries);
  dispatch(engineTouchedRecounted({ touched: touchedOnBranch(reconciled) }));
  for (const { entryId, verdict } of reconciled) {
    // Reported, never acted on. §7 words the matching case as "can be brought
    // in line with the branch", which the record cannot do: it holds a
    // fingerprint rather than the text, deliberately (Task 1), so there is no
    // branch version to put back. See `reconcile.ts`.
    await log(`[engine] ${entryId} is ${verdict} at this node`);
  }

  // Found, never created: `ensureNamedCategory` would mint `SE: Threads` in the
  // lorebook of a writer who has never switched the Engine on.
  //
  // **No category means no category arm at all**, rather than an id nothing can
  // equal. An earlier form compared against `?? ""` on the reasoning that
  // `LorebookEntry.category` is optional and an uncategorised entry therefore
  // carries `undefined` — which was asserted, never established. This codebase
  // hedges the other way in two other places (`mount.ts`, `forge-chat-effects.ts`
  // both test `!e.category`), and if the runtime hands back `""` for an
  // uncategorised entry then every loose entry the writer owns is claimed as a
  // thread orphan, found nameless, and written `{enabled: false}` — on the
  // first Ctrl+Z of someone who has never switched the Engine on, since this
  // runs unconditionally. Two surfaces disagreeing about one runtime fact is
  // the defect; skipping the arm costs a line and removes the question.
  //
  // The other half of §7's union is untouched by this: a thread's own
  // `lorebookEntryId` still answers for its entry, wherever the writer has
  // filed it. What the skip gives up is finding an orphan in a story that has
  // no `SE: Threads` category — and only this phase's `open` creates that
  // category, so a story without one has never had a thread entry to orphan.
  const threadCategory = categories.find(
    (c) => c.name === SE_THREAD_CATEGORY,
  )?.id;
  const flips = reconcileThreadEntries({
    entries,
    threadCategoryIds:
      threadCategory === undefined
        ? []
        : entries
            .filter((entry) => entry.category === threadCategory)
            .map((entry) => entry.id),
    threads: world.threads,
  });

  for (const { entryId, enabled } of flips) {
    // Re-asked per flip, not only before the loop. Each write is an await, so a
    // held Ctrl+Z can overtake a reconciliation that has already started
    // writing — and every flip after that point is a stale node's answer,
    // landing last and winning. Self-correcting on the next navigation, but the
    // window is exactly as long as the writer keeps the key down.
    if (!stillCurrent()) return;
    await writeLorebookEntry({ entryId, nodeId }, () => ({ enabled }));
    await log(
      `[engine] thread entry ${entryId} ${enabled ? "re-enabled" : "disabled"} — the branch says so`,
    );
  }
}

export function registerHistorySyncEffects(
  dispatch: AppDispatch,
  autosave: AutosaveHandle,
): void {
  // Navigations are not equal-cost: loadBranchState fans out over the target
  // node's index, so a rich node's read can resolve after a later, emptier
  // one's. Only the newest navigation may dispatch — otherwise the World the
  // writer is looking at is the one they navigated *through*.
  let generation = 0;

  // Built once, not per navigation: the flag is read from `api.v1.config`,
  // which cannot change mid-session, and a logger per Ctrl+Z would ask the same
  // question on every keypress.
  const log = createEngineLog();

  api.v1.hooks.register("onHistoryNavigated", async ({ nodeId }) => {
    const mine = ++generation;
    const stillCurrent = () => mine === generation;

    // Re-derive anything keyed off document content (the opening-scene card).
    dispatch(documentHistoryNavigated());

    // Get the pre-navigation state onto the node it describes before replacing
    // it. Autosave's 2s debounce is very likely still in flight — Ctrl+Z lands
    // well inside it — and its pendingNode is the node we are leaving.
    await autosave.flush();

    // Replace, never merge: an entity created on the branch we just left must
    // disappear, and applyRecords always returns a complete world — empty when
    // the target node carries no index — so the reducer's replace is total.
    //
    // Neither chat nor foundation appears here, for the same reason: both are
    // story-scoped. Undo moves the World and the story fields; it does not
    // rewrite the premise or hide the conversation that produced it.
    const branch = await loadBranchState(nodeId);
    if (!stillCurrent()) return;
    dispatch(persistedDataLoaded({ story: branch.story, world: branch.world }));

    // §7. After the replace rather than before it: the writer's World repaints
    // on the fast path, and the lorebook — which nothing on screen is waiting
    // for — is put right behind it.
    try {
      await reconcileLorebook(
        nodeId,
        branch.world,
        dispatch,
        log,
        stillCurrent,
      );
    } catch (error) {
      await log("[engine] reconciliation failed:", error);
    }
  });
}
