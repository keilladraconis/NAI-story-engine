// The Engine's settings, and the storyStorage record that holds them.
//
// They used to be `project.yaml` entries read through `api.v1.config.get`. That
// API is read-only — `get`, no `set` — so a Setup-tab control could never write
// one back. Moving them into Story Engine's own storage makes them **per story**,
// which is the right granularity rather than a consolation: the Engine is for a
// writer steering an autonomous story, and the same person may hand-write the
// next one.
//
// One record, not one key per setting. All three are read together on every pass and
// written together from one form, and storyStorage has none of historyStorage's
// copy-on-write-per-key reason to shard (see intents.ts, where the watermark and
// the queue are deliberately kept apart for exactly that reason).
//
// storyStorage, not historyStorage, for the same reason Foundation lives there:
// "is the Engine on" is a property of the story, not of a point in it. Undoing
// three paragraphs must not switch the Engine off.
//
// **The slot is not trusted.** It is JSON some previous version wrote, and once
// the Setup form lands a writer can reach it through a text field. Every read
// goes through `normalizeEngineSettings`, so a missing record, a partial one, or
// a hostile value all yield a settings object a pass can actually use.

import { STORAGE_KEYS } from "../keys";

export type EngineSettings = {
  enabled: boolean;
  delayMs: number;
  minProse: number;
  /** How many Threads a story may hold at once (§4.5). Enforced where it
   *  cannot be bypassed — the reducer, see `src/core/engine/thread-cap.ts` —
   *  rather than at the callsites that create threads. */
  threadCap: number;
};

/** What a story that has never been configured gets.
 *
 *  `enabled` is false on purpose: a loop that only watches has not earned the
 *  right to spend the script's output budget on every generation. Opting in is
 *  a decision, per story. */
export const ENGINE_DEFAULTS: EngineSettings = {
  enabled: false,
  delayMs: 8000,
  minProse: 1,
  threadCap: 8,
};

// ───────────────────────────────── the bounds ─────────────────────────────────
//
// Each one is here because something breaks outside it. A bound that cannot be
// justified is one the next person will change arbitrarily, so none are round
// numbers for their own sake.

/** The wakeup is armed when a generation STARTS (engine-loop.ts §3.1), so the
 *  delay is measured against the writer's own stream. Under a second the wakeup
 *  lands before that generation has produced its first tokens, the backend lock
 *  refuses the pass, and an Engine that reports itself on never actually reads
 *  anything. Zero and negative are the same failure at its worst — the timer
 *  fires on the next tick, every time, forever. */
export const DELAY_MS_MIN = 1000;

/** The wakeup is one-shot and `pending` stays true until it fires: no generation
 *  during the wait arms another. A delay longer than a stretch of writing
 *  therefore buys one pass per session at best, and a mistyped extra zero
 *  (80000000ms, twenty-two hours) buys none at all while the HUD still says the
 *  Engine is on. Five minutes is already far past any useful "read what I just
 *  wrote" latency, so nothing legitimate is lost above it. */
export const DELAY_MS_MAX = 300_000;

/** Below 1 the threshold asserts that a pass is worth running on no new prose —
 *  a triage generation spent on nothing. 1 is also the default, at which the
 *  gate is a no-op and every non-empty backlog runs. */
export const MIN_PROSE_MIN = 1;

/** A threshold no backlog reaches is an Engine that never fires, which is the
 *  same silent failure as a delay of a day. It costs twice over: the pass holds
 *  every unread paragraph until the threshold is met, and those paragraphs are
 *  the volatile tail of the triage prompt when it finally is — so a threshold in
 *  the thousands defers the pass indefinitely and then sends a chapter as input.
 *  A hundred paragraphs is already several scenes. */
export const MIN_PROSE_MAX = 100;

/** Below 1 no thread may exist at all: the Forge's `[THREAD]` command and the
 *  World's "+ New Thread" would both accept a click and leave nothing behind,
 *  which reads as a broken feature rather than as a setting. 1 is the smallest
 *  cap the mechanism still works at — each new commitment displaces the last. */
export const THREAD_CAP_MIN = 1;

/** A cap has to be low enough to still be capping. Every thread is a lorebook
 *  entry whose reminder prose injects when the story stops carrying it
 *  (`thread-condition.ts`), and phase 5's triage manifest lists every thread on
 *  every pass — so the ceiling is where the cap stops being proliferation
 *  control and becomes permission to poison the context the Engine exists to
 *  improve. Forty simultaneous reminders is on the order of two to three
 *  thousand tokens of injection, a third of an Erato context, plus forty lines
 *  in the prompt of every pass. It is also five times the default, so a writer
 *  who genuinely runs a crowded story has room to say so. */
export const THREAD_CAP_MAX = 40;

/** A stored record as it may actually be: every field optional, every field of
 *  unknown type. `storyStorage.get` is typed `Promise<any>`, so the shape is
 *  named here at the boundary rather than let loose, the way mount.ts names what
 *  it loads. */
type StoredEngineSettings = Partial<Record<keyof EngineSettings, unknown>>;

function readBoolean(value: unknown, fallback: boolean): boolean {
  // No coercion. `"false"` is truthy and `"true"` is a form that failed to parse
  // its input — both should show the writer a default they can see and re-enter,
  // not a setting that quietly means the opposite of what it says.
  return typeof value === "boolean" ? value : fallback;
}

/** Clamp a stored number into a range, or fall back when it is not a usable
 *  number at all.
 *
 *  The two paths are different on purpose. A finite number outside the range is
 *  a writer's intent, expressed too far — clamping keeps it. `NaN`, `Infinity`,
 *  a string, an object: those carry no intent to preserve, and `Math.min`/`max`
 *  propagate `NaN` rather than repairing it, so they take the default instead.
 *
 *  `round` runs after the clamp so the stored number means exactly what it does:
 *  the loop compares an integer backlog against `minProse` and hands `delayMs`
 *  straight to a timer. */
function readNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
  round: (n: number) => number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return round(Math.min(Math.max(value, min), max));
}

/** Everything above, applied to one stored value of any shape.
 *
 *  Exported because the Setup form writes through the same funnel and should be
 *  able to show what a value became without a round-trip through storage. */
export function normalizeEngineSettings(value: unknown): EngineSettings {
  // Anything that is not a record — null, a string, an array from some earlier
  // three-value shape — has no fields to read, so it reads as a fresh install.
  const record: StoredEngineSettings =
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as StoredEngineSettings)
      : {};

  return {
    enabled: readBoolean(record.enabled, ENGINE_DEFAULTS.enabled),
    delayMs: readNumber(
      record.delayMs,
      ENGINE_DEFAULTS.delayMs,
      DELAY_MS_MIN,
      DELAY_MS_MAX,
      Math.round,
    ),
    // Rounded UP, not to nearest: the gate skips while `backlog < minProse`, so
    // 2.5 already behaves as 3. Rounding up normalises the number without
    // changing what it does; rounding down would quietly lower the threshold.
    minProse: readNumber(
      record.minProse,
      ENGINE_DEFAULTS.minProse,
      MIN_PROSE_MIN,
      MIN_PROSE_MAX,
      Math.ceil,
    ),
    // Rounded DOWN, the mirror of `minProse` and for the same reason: the cap
    // admits a thread while the list is shorter than it, so 8.5 already behaves
    // as 8. Rounding down normalises the number without changing what it does;
    // rounding up would quietly raise the ceiling by one.
    threadCap: readNumber(
      record.threadCap,
      ENGINE_DEFAULTS.threadCap,
      THREAD_CAP_MIN,
      THREAD_CAP_MAX,
      Math.floor,
    ),
  };
}

/** The Engine's settings, read fresh each time so switching the Engine off takes
 *  effect on the next generation rather than the next session. */
export async function readEngineSettings(): Promise<EngineSettings> {
  const stored: unknown = await api.v1.storyStorage.get(
    STORAGE_KEYS.ENGINE_SETTINGS,
  );
  return normalizeEngineSettings(stored);
}

/** Persist the settings. Normalised on the way in as well as on the way out, so
 *  the slot never holds a value the next read has to repair — and so what the
 *  form shows after a save is what the loop will act on. */
export async function writeEngineSettings(next: EngineSettings): Promise<void> {
  await api.v1.storyStorage.set(
    STORAGE_KEYS.ENGINE_SETTINGS,
    normalizeEngineSettings(next),
  );
}
