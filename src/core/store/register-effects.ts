import { Store } from "nai-store";
import { RootState } from "./types";
import { GenX } from "nai-gen-x";
import { registerSegaEffects } from "./effects/sega";
import { registerChatEffects } from "./effects/chat-effects";
import { registerGenerationEngineEffects } from "./effects/generation-engine";
import { registerLorebookSyncEffects } from "./effects/lorebook-sync";
import { registerLorebookGenerationEffects } from "./effects/lorebook-generation";
import { registerAutosaveEffects } from "./effects/autosave";
import { registerForgeChatEffects } from "./effects/forge-chat-effects";
import { registerFoundationEffects } from "./effects/foundation-effects";
import { registerSummaryGenerationEffects } from "./effects/summary-generation";
import { registerBootstrapEffects } from "./effects/bootstrap-effects";
import { registerHistorySyncEffects } from "./effects/history-sync";
import { registerEngineLoopEffects } from "./effects/engine-loop";
import { registerThreadConditionEffects } from "../engine/thread-bind";

export { syncEratoCompatibility } from "./effects/lorebook-sync";

export function registerEffects(store: Store<RootState>, genX: GenX): void {
  const { subscribeEffect, dispatch, getState } = store;
  registerChatEffects(subscribeEffect, dispatch, getState);
  registerSegaEffects(subscribeEffect, dispatch, getState, genX);
  registerGenerationEngineEffects(subscribeEffect, dispatch, getState, genX);
  registerLorebookSyncEffects(subscribeEffect, dispatch, getState);
  registerLorebookGenerationEffects(subscribeEffect, dispatch, getState);
  const autosave = registerAutosaveEffects(subscribeEffect, getState);
  registerForgeChatEffects(subscribeEffect, dispatch, getState);
  registerFoundationEffects(subscribeEffect, dispatch, getState);
  registerSummaryGenerationEffects(subscribeEffect, dispatch, getState);
  registerBootstrapEffects(subscribeEffect, dispatch, getState);
  // Navigation must flush autosave before it replaces the store, so history-sync
  // needs the handle registerAutosaveEffects returns.
  registerHistorySyncEffects(dispatch, autosave);
  // The Engine's wakeup. Off unless the story's settings say otherwise, so
  // registering it costs nothing until the writer opts in.
  registerEngineLoopEffects({ subscribeEffect, dispatch, getState, genX });
  // A thread's forgetting detector is built from its title, its cast and its
  // horizon (§4.3), so the three actions that change any of them have to
  // rebuild it — a detector left probing a renamed thread's old name never
  // matches and reminds forever. Registered whether or not the Engine is on:
  // the writer can edit a thread the Engine opened before switching it off.
  registerThreadConditionEffects(subscribeEffect, getState, dispatch);
}
