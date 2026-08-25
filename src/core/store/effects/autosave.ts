import { Store } from "nai-store";
import { RootState } from "../types";
import { STORAGE_KEYS } from "../../keys";
import { saveWorldRecord } from "../persistence/story-store";

const AUTOSAVE_DELAY_MS = 2000;

/** Slices whose actions mean "persist something". `ui` and `runtime` are
 *  ephemeral; `forge` has never been written and stays in memory.
 *
 *  One destination now. Everything Story Engine records is story-scoped: the
 *  World is the writer's notebook about the story, not a projection of the
 *  document, so no part of it is a property of a point in history. Three
 *  records rather than one only because they change on different rhythms — a
 *  chat message must not carry the whole World with it. */
const PERSIST_PREFIXES = ["story/", "world/", "chat/", "foundation/"];

export function registerAutosaveEffects(
  subscribeEffect: Store<RootState>["subscribeEffect"],
  getState: () => RootState,
): void {
  // Cancellation-flag debounce: avoids storing the async timer ID.
  let _cancel: (() => void) | null = null;

  async function flush(): Promise<void> {
    // Claim the pending window before the first await: a second flush racing
    // this one must not write the same records twice.
    if (_cancel !== null) {
      _cancel();
      _cancel = null;
    }
    try {
      const state = getState();
      await saveWorldRecord(state);
      await api.v1.storyStorage.set(STORAGE_KEYS.CHAT, state.chat);
      await api.v1.storyStorage.set(STORAGE_KEYS.FOUNDATION, state.foundation);
    } catch (e) {
      /* ignore */
    }
  }

  subscribeEffect(
    (action) => PERSIST_PREFIXES.some((p) => action.type.startsWith(p)),
    () => {
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
