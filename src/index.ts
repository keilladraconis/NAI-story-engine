import { start } from "./ui/mount";

// `start()` is the only thing this file does, and its rejection had nowhere to
// go: `void` discards the promise, so a throw anywhere in the mount path — the
// persisted-state load is the one that reads data it did not write — left the
// script with no sidebar, no HUD and nothing in the log to say why. The
// defences in `persistence/` are what stop that being reachable; this is what
// makes the next one visible instead of silent. It cannot mount a UI to
// apologise with, so the log is the whole remedy.
void start().catch((error: unknown) => {
  api.v1.log(`[story-engine] failed to start: ${String(error)}`);
});
