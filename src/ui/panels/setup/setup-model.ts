// Pure derivation for the Setup tab's action row: the bootstrap button's label
// and disabled state, and whether Import is available.
//
// This lived in header-model.ts while bootstrap and Import sat in the header,
// and moved here with them. header-model.ts is left holding only the generation
// state machine — see the guard in tests/ui/countdown.test.ts.

import type { RootState } from "../../../core/store";

export type SetupModel = {
  bootstrap: { text: string; disabled: boolean };
  importDisabled: boolean;
};

export type SetupInputs = {
  /** Cached async read of api.v1.document.sectionIds(); the caller owns it. */
  hasDocumentContent: boolean;
};

const BOOTSTRAP_TYPES: readonly string[] = ["bootstrap", "bootstrapContinue"];

/** Is an opening/continue generation queued or in flight? Also read by
 *  useHasDocumentContent — a bootstrap is what turns an empty story non-empty. */
export function selectBootstrapPending(state: RootState): boolean {
  const { queue, activeRequest } = state.runtime;
  return (
    queue.some((r) => BOOTSTRAP_TYPES.includes(r.type)) ||
    (activeRequest !== null && BOOTSTRAP_TYPES.includes(activeRequest.type))
  );
}

export function deriveSetup(state: RootState, inputs: SetupInputs): SetupModel {
  return {
    bootstrap: {
      text: inputs.hasDocumentContent ? "Continue Scene" : "Opening Scene",
      disabled: selectBootstrapPending(state),
    },
    importDisabled: state.ui.importWizardOpen,
  };
}

/** Change-detection key the Setup action row subscribes with. It must cover
 *  every store field deriveSetup reads, plus historyEpoch, which is what moves
 *  when the document is undone and so changes the bootstrap label. */
export function setupSignature(state: RootState): string {
  const { queue, activeRequest, historyEpoch } = state.runtime;
  return [
    // Full composition, not length: a same-size queue with different contents
    // changes what the row shows.
    queue.map((r) => `${r.type}:${r.id}`).join(","),
    activeRequest?.id ?? "",
    state.ui.importWizardOpen ? "1" : "0",
    historyEpoch,
  ].join("|");
}
