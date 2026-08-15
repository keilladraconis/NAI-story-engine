import { Store } from "nai-store";
import { RootState } from "../types";
import { STORAGE_KEYS } from "../../keys";
import { toRecords } from "../persistence/keyspace";
import { captureNode, saveRecords } from "../persistence/history-store";

const AUTOSAVE_DELAY_MS = 2000;

/** Slices whose actions mean "persist something". `ui` and `runtime` are
 *  ephemeral; `forge` has never been written and stays in memory. */
const BRANCH_PREFIXES = ["story/", "world/", "foundation/"];
const CHAT_PREFIX = "chat/";

/** Handle for callers that must get the pending write onto disk before the
 *  store changes underneath it. history-sync is the only one: navigation
 *  replaces every branch-scoped slice, so a debounce still in flight would
 *  otherwise write post-navigation state onto the pre-navigation node. */
export type AutosaveHandle = {
  flush: () => Promise<void>;
};

export function registerAutosaveEffects(
  subscribeEffect: Store<RootState>["subscribeEffect"],
  getState: () => RootState,
): AutosaveHandle {
  // Cancellation-flag debounce: avoids storing the async timer ID.
  let _cancel: (() => void) | null = null;
  // Captured when the action is dispatched, NOT when the flush runs. Ordinary
  // writing creates history nodes continuously and onHistoryNavigated does not
  // fire for them, so a 2s debounce can easily land after the cursor has moved
  // — writing this state onto a node it does not describe. See design §6.3.
  let pendingNode: Promise<number> | null = null;

  async function flush(): Promise<void> {
    // Claim the pending window before the first await: a second flush racing
    // this one must not write the same records twice, and must not re-read a
    // pendingNode this call has already consumed.
    if (_cancel !== null) {
      _cancel();
      _cancel = null;
    }
    const node = pendingNode;
    pendingNode = null;
    try {
      const state = getState();
      // Chat follows the writer, not the branch.
      await api.v1.storyStorage.set(STORAGE_KEYS.CHAT, state.chat);
      if (node !== null) {
        await saveRecords(toRecords(state), await node);
      }
    } catch (e) {
      /* ignore */
    }
  }

  subscribeEffect(
    (action) =>
      BRANCH_PREFIXES.some((p) => action.type.startsWith(p)) ||
      action.type.startsWith(CHAT_PREFIX),
    (action) => {
      const branchScoped = BRANCH_PREFIXES.some((p) =>
        action.type.startsWith(p),
      );
      if (branchScoped && pendingNode === null) pendingNode = captureNode();

      if (_cancel !== null) _cancel();
      let cancelled = false;
      _cancel = () => {
        cancelled = true;
      };

      void api.v1.timers.setTimeout(async () => {
        if (cancelled) return;
        await flush();
      }, AUTOSAVE_DELAY_MS);
    },
  );

  return { flush };
}
