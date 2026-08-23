// The Engine's account of itself, behind `story_engine_debug`.
//
// §9.1's HUD is the always-on surface; these lines are the detail behind it,
// and with the flag off the Engine is silent.
//
// This flag gates ONLY Story Engine's own output. nai-store's dispatch firehose
// has its own switch (`store_action_log`, see `core/store/index.ts`) because the
// two shared one at first, and sharing meant reading what the Engine decided
// required turning on many lines per keystroke that buried it.
//
// **Read once, where the logger is built.** `api.v1.config` is read-only and a
// `project.yaml` entry cannot change mid-session, so a read per line would ask
// the same question five times a pass and answer it identically. The promise is
// the read; every line awaits the same one.
//
// Its own module because the pass is no longer the only thing that speaks:
// §7's reconciliation runs from the navigation handler and disables lorebook
// entries there, which is exactly the kind of detail this flag exists to carry.
// A second copy of these eight lines would be a second answer to "is the Engine
// allowed to talk".

export type EngineLog = (...messages: unknown[]) => Promise<void>;

export function createEngineLog(): EngineLog {
  const debug: Promise<boolean> = api.v1.config
    .get("story_engine_debug")
    .then((value: unknown) => value === true);

  return async (...messages) => {
    if (await debug) api.v1.log(...messages);
  };
}
