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
import { registerFoundationEffects } from "./effects/foundation-effects";
import { registerStoryEffects } from "./effects/story-effects";
import { registerSummaryGenerationEffects } from "./effects/summary-generation";
import { registerBootstrapEffects } from "./effects/bootstrap-effects";

export { syncEratoCompatibility } from "./effects/lorebook-sync";

export function registerEffects(store: Store<RootState>, genX: GenX): void {
  const { subscribeEffect, dispatch, getState } = store;
  registerStoryEffects(subscribeEffect, dispatch, getState);
  registerBrainstormEffects(subscribeEffect, dispatch, getState);
  registerSegaEffects(subscribeEffect, dispatch, getState, genX);
  registerGenerationEngineEffects(subscribeEffect, dispatch, getState, genX);
  registerLorebookSyncEffects(subscribeEffect, dispatch, getState);
  registerLorebookGenerationEffects(subscribeEffect, dispatch, getState);
  registerAutosaveEffects(subscribeEffect, getState);
  registerForgeEffects(subscribeEffect, dispatch, getState, genX);
  registerFoundationEffects(subscribeEffect, dispatch, getState);
  registerSummaryGenerationEffects(subscribeEffect, dispatch, getState);
  registerBootstrapEffects(subscribeEffect, dispatch, getState);
}
