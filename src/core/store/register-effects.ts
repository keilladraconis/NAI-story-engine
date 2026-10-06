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
  registerAutosaveEffects(subscribeEffect, getState);
  registerForgeChatEffects(subscribeEffect, dispatch, getState);
  registerFoundationEffects(subscribeEffect, dispatch, getState);
  registerSummaryGenerationEffects(subscribeEffect, dispatch, getState);
  registerBootstrapEffects(subscribeEffect, dispatch, getState);
  // The Engine's wakeup. Off unless the story's settings say otherwise, so
  // registering it costs nothing until the writer opts in.
  registerEngineLoopEffects({ subscribeEffect, dispatch, getState, genX });
  // A thread's entry follows its title, its cast, its state and its status,
  // so every action that changes one re-syncs it (`syncThreadEntry`).
  // Registered whether or not the Engine is on: the writer can edit a thread
  // the Engine opened before switching it off.
  registerThreadConditionEffects(subscribeEffect, getState, dispatch);
}
