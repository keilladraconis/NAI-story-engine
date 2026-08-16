// The single onHistoryNavigated registration.
//
// api.v1.hooks.register holds ONE callback per hook name, so this is the only
// place in the codebase that may register this hook — bootstrap-effects.ts used
// to, for historyEpoch, and that job moved here rather than competing for the
// slot.
//
// The hook fires only on explicit navigation (undo/redo/retry/jump), never for
// nodes created by ordinary editing or generation, so this is a
// branch-exploration signal rather than something that runs while writing.
//
// nodeId arrives as a number despite the .d.ts declaring string — corrected in
// src/type-overrides.d.ts, measured in design §12.1.

import type { AppDispatch } from "../types";
import { persistedDataLoaded } from "../index";
import { documentHistoryNavigated } from "../slices/runtime";
import { loadBranchState } from "../persistence/history-store";
import type { AutosaveHandle } from "./autosave";

export function registerHistorySyncEffects(
  dispatch: AppDispatch,
  autosave: AutosaveHandle,
): void {
  // Navigations are not equal-cost: loadBranchState fans out over the target
  // node's index, so a rich node's read can resolve after a later, emptier
  // one's. Only the newest navigation may dispatch — otherwise the World the
  // writer is looking at is the one they navigated *through*.
  let generation = 0;

  api.v1.hooks.register("onHistoryNavigated", async ({ nodeId }) => {
    const mine = ++generation;

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
    if (mine !== generation) return;
    dispatch(persistedDataLoaded({ story: branch.story, world: branch.world }));
  });
}
