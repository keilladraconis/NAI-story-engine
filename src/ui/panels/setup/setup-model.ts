// Pure derivation for the Setup tab.
//
// The tab is a staged nudge — brainstorm, then Foundation, then the opening
// scene — and every rule about what is showing lives here rather than as
// conditions scattered through the JSX. One function, one set of tests, one
// place to look when the flow is wrong.
//
// This lived in header-model.ts while bootstrap and Import sat in the header,
// and moved here with them. header-model.ts is left holding only the generation
// state machine — see the guard in tests/ui/countdown.test.ts.

import type { RootState } from "../../../core/store";
import { foundationFieldsEmpty } from "../foundation/fields";
import { hasBrainstormContent } from "../chat/chat-actions";

export type SetupModel = {
  /** The brainstorm prompt: only while there is nothing to work from at all. */
  showBrainstormCta: boolean;
  /** Foundation section open? Follows the flow until the writer overrides it. */
  foundationOpen: boolean;
  /** The opening-scene card: once the Foundation has content and the story is
   *  still blank. There is no Continue — once prose exists, this is done. */
  showBootstrap: boolean;
  bootstrapDisabled: boolean;
  importDisabled: boolean;
};

export type SetupInputs = {
  /** Cached async read of api.v1.document.sectionIds(); the caller owns it. */
  hasDocumentContent: boolean;
};

const BOOTSTRAP_TYPES: readonly string[] = ["bootstrap"];

/** Is the opening generation queued or in flight? Also read by
 *  useHasDocumentContent — a bootstrap is what turns an empty story non-empty. */
export function selectBootstrapPending(state: RootState): boolean {
  const { queue, activeRequest } = state.runtime;
  return (
    queue.some((r) => BOOTSTRAP_TYPES.includes(r.type)) ||
    (activeRequest !== null && BOOTSTRAP_TYPES.includes(activeRequest.type))
  );
}

/** Collapsed until a brainstorm has something in it, then open — but the
 *  writer's own toggle wins from the first time they use it, forever after. */
export function foundationOpen(
  expanded: boolean | null,
  brainstormStarted: boolean,
): boolean {
  return expanded ?? brainstormStarted;
}

export function deriveSetup(state: RootState, inputs: SetupInputs): SetupModel {
  const fieldsEmpty = foundationFieldsEmpty(state);
  const brainstormStarted = hasBrainstormContent(state.chat.chats);

  return {
    // Both conditions matter: an untouched Foundation is what makes the prompt
    // relevant, and a brainstorm already under way is what makes it redundant.
    showBrainstormCta: fieldsEmpty && !brainstormStarted,
    foundationOpen: foundationOpen(
      state.ui.foundationExpanded,
      brainstormStarted,
    ),
    showBootstrap: !fieldsEmpty && !inputs.hasDocumentContent,
    bootstrapDisabled: selectBootstrapPending(state),
    importDisabled: state.ui.importWizardOpen,
  };
}

/** Change-detection key the Setup tab subscribes with. It must cover every
 *  store field deriveSetup reads, plus historyEpoch, which is what moves when
 *  the document is undone. */
export function setupSignature(state: RootState): string {
  const { queue, activeRequest, historyEpoch } = state.runtime;
  return [
    // Full composition, not length: a same-size queue with different contents
    // changes what the tab shows.
    queue.map((r) => `${r.type}:${r.id}`).join(","),
    activeRequest?.id ?? "",
    state.ui.importWizardOpen ? "1" : "0",
    state.ui.foundationExpanded === null
      ? "n"
      : state.ui.foundationExpanded
        ? "1"
        : "0",
    foundationFieldsEmpty(state) ? "1" : "0",
    hasBrainstormContent(state.chat.chats) ? "1" : "0",
    historyEpoch,
  ].join("|");
}
