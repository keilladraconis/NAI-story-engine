import { Store } from "nai-store";
import { RootState } from "../types";
import { STORAGE_KEYS } from "../../keys";
import { toRecords } from "../persistence/keyspace";
import { captureNode, saveRecords } from "../persistence/history-store";

const AUTOSAVE_DELAY_MS = 2000;

/** Slices whose actions mean "persist something". `ui` and `runtime` are
 *  ephemeral; `forge` has never been written and stays in memory.
 *
 *  Two destinations, and which one a slice uses is a claim about what the data
 *  belongs to. `story` and `world` are derived from the prose at a particular
 *  point, so they are branch-scoped and go to historyStorage at a captured
 *  node. `chat` and `foundation` describe the writer and the story as a whole,
 *  so they go to storyStorage and are untouched by undo. */
const BRANCH_PREFIXES = ["story/", "world/"];
const STORY_PREFIXES = ["chat/", "foundation/"];

// The flush was once handed out as a handle, because navigation replaced every
// branch-scoped slice and a debounce still in flight would have written
// post-navigation state onto the node it was leaving. Nothing replaces the store
// any more, so the only caller is the debounce itself and there is no handle.

export function registerAutosaveEffects(
  subscribeEffect: Store<RootState>["subscribeEffect"],
  getState: () => RootState,
): void {
  // Cancellation-flag debounce: avoids storing the async timer ID.
  let _cancel: (() => void) | null = null;
  // Captured when the action is dispatched, NOT when the flush runs. Ordinary
  // writing creates history nodes continuously and onHistoryNavigated does not
  // fire for them, so a 2s debounce can easily land after the cursor has moved
  // — writing this state onto a node it does not describe. See design §6.3.
  //
  // And captured on the FIRST action of a burst, not the last: a window holding
  // two edits either side of a node boundary writes both onto the earlier node.
  // That is deliberate. The alternative — re-capturing per action — stamps the
  // whole window with the later node, so undoing back across the boundary loses
  // the first edit outright. Leaking a later edit backwards is recoverable (the
  // next flush at the later node writes it there too); losing one is not.
  // Pinned by "keeps the whole burst on the node it started at" below.
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
      // Story-scoped: these follow the writer, not the branch. Written on every
      // flush regardless of what triggered it — they are always current, so
      // there is no node to get wrong.
      await api.v1.storyStorage.set(STORAGE_KEYS.CHAT, state.chat);
      await api.v1.storyStorage.set(STORAGE_KEYS.FOUNDATION, state.foundation);
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
      STORY_PREFIXES.some((p) => action.type.startsWith(p)),
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
}
