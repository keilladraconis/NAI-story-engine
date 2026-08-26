import { installStoryStorageFake } from "./story-storage-fake";
import { STORAGE_KEYS } from "../../src/core/keys";
import { ENGINE_DEFAULTS } from "../../src/core/engine/settings";
import type { CreativeModel } from "../../src/core/utils/config";

/** Put a story on a creative model.
 *
 *  The choice lives in the Engine's settings record, not in `api.v1.config` —
 *  that API is read-only, so a Setup control could never write one back. Tests
 *  that used to mock `config.get("xialong_mode")` seed the record instead, and
 *  they must go through storage rather than stubbing `resolveModel`: the whole
 *  point of the record is that a story reads its own answer, and a stub would
 *  pass whether or not that read works.
 *
 *  Installs the storyStorage fake itself and returns it, so a caller that also
 *  needs the fake does not install a second one over the settings just written.
 */
export function useCreativeModel(
  model: CreativeModel,
): ReturnType<typeof installStoryStorageFake> {
  const fake = installStoryStorageFake();
  fake.set(STORAGE_KEYS.ENGINE_SETTINGS, {
    ...ENGINE_DEFAULTS,
    creativeModel: model,
  });
  return fake;
}
