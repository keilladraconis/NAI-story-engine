import { Store } from "nai-store";
import { RootState } from "./types";
import { GenX } from "nai-gen-x";
import { registerSegaEffects } from "./effects/sega";
import { registerBrainstormEffects } from "./effects/brainstorm-effects";
import { registerGenerationEngineEffects } from "./effects/generation-engine";
import { registerLorebookSyncEffects } from "./effects/lorebook-sync";
import { registerLorebookGenerationEffects } from "./effects/lorebook-generation";
import { registerAutosaveEffects } from "./effects/autosave";
import { registerForgeEffects } from "./effects/forge-effects";

export { syncEratoCompatibility } from "./effects/lorebook-sync";

export function registerEffects(store: Store<RootState>, genX: GenX): void {
  const { subscribeEffect, dispatch, getState } = store;
  registerBrainstormEffects(subscribeEffect, dispatch, getState);
  registerSegaEffects(subscribeEffect, dispatch, getState, genX);
  registerGenerationEngineEffects(subscribeEffect, dispatch, getState, genX);
  registerLorebookSyncEffects(subscribeEffect, dispatch, getState);
  registerLorebookGenerationEffects(subscribeEffect, dispatch, getState);
  registerAutosaveEffects(subscribeEffect, getState);
  registerForgeEffects(subscribeEffect, dispatch, getState, genX);
}
