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

export function registerHistorySyncEffects(dispatch: AppDispatch): void {
  api.v1.hooks.register("onHistoryNavigated", async ({ nodeId }) => {
    // Re-derive anything keyed off document content (the opening-scene card).
    dispatch(documentHistoryNavigated());

    // Replace, never merge: an entity created on the branch we just left must
    // disappear, and applyRecords always returns a complete world — empty when
    // the target node carries no index — so the reducer's replace is total.
    const branch = await loadBranchState(nodeId);
    dispatch(
      persistedDataLoaded({
        story: branch.story,
        world: branch.world,
        foundation: branch.foundation,
      }),
    );
  });
}
