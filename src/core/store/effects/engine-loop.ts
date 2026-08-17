// The Engine's trigger: the single onGenerationRequested registration.
//
// api.v1.hooks.register holds ONE callback per hook name, so this is the only
// place in the codebase that may register this hook — a second registration
// anywhere silently replaces this one and the Engine simply stops waking, with
// nothing in the UI to explain it. Guarded by a source scan in
// tests/core/engine/trigger.test.ts, the same way history-sync.ts guards
// onHistoryNavigated, plus a wiring guard: the source scan alone passes just as
// happily when nothing calls registerEngineLoopEffects at all.
//
// Design §3.1. A user generation schedules a ONE-SHOT wakeup a configurable
// delay later. Three properties carry the whole trigger:
//
//   1. `scriptInitiated: false` is a filter, not a detail. The Engine's own
//      generations go through this hook too; without the filter each pass
//      re-arms the wakeup that started it and the loop drives itself forever.
//   2. One wakeup per window. A further generation while one is pending does
//      NOT reschedule it, so the pass is anchored to the FIRST generation of a
//      burst — no stacking, and no starvation for a writer who generates faster
//      than the delay.
//   3. The delay is measured from generation start, deliberately. A pass that
//      lands mid-stream is refused by the backend lock, and a refusal is free
//      (§12.0). Tracking an in-flight window instead would be a persistent flag
//      that can fail to close — one missed onGenerationEnd and the Engine is
//      gated off permanently and silently.
//
// There is no idle or fallback tick. Prose written by hand produces no hook and
// therefore no wakeup: §1.2 calls that a positioning decision, not a gap. The
// same shape is what makes the loop safe by construction (§3.5) — when the
// writer stops generating, the Engine goes quiet on its own.
//
// No timer id is stored. api.v1.timers.setTimeout returns a Promise<number>,
// which is awkward to hold and clear (§3.1 points at autosave.ts's
// cancellation-flag pattern for the same reason). Nothing here ever cancels a
// wakeup — the `pending` flag below is the whole of the bookkeeping.

import type { Store } from "nai-store";
import type { GenX } from "nai-gen-x";
import type { AppDispatch, RootState } from "../types";

/** Everything the loop needs from the app, as one object so the pass body can
 *  reach for another dependency without reshuffling an argument list.
 *
 *  Only the trigger exists today; the fields are what the pass in Task 7 drives
 *  — `subscribeEffect` for the HUD's manual ⚡ request, `dispatch` to mirror
 *  LoopState into the store, `getState` for the World the manifest is built
 *  from, and `genX` for the one triage generation a pass spends. */
export type EngineLoopDeps = {
  subscribeEffect: Store<RootState>["subscribeEffect"];
  dispatch: AppDispatch;
  getState: () => RootState;
  genX: GenX;
};

/** Fallbacks for the project.yaml entries, so a config read that returns
 *  nothing behaves like a fresh install rather than NaN milliseconds.
 *
 *  `enabled` is false on purpose: a loop that only logs has not earned the
 *  right to spend the script's output budget on every generation. */
export const ENGINE_DEFAULTS = {
  enabled: false,
  delayMs: 8000,
  minProse: 1,
} as const;

export type EngineSettings = {
  enabled: boolean;
  delayMs: number;
  minProse: number;
};

/** api.v1.config.get is typed `Promise<any>` and the value comes from user
 *  settings, so it is validated rather than trusted. */
async function readBoolean(key: string, fallback: boolean): Promise<boolean> {
  const value: unknown = await api.v1.config.get(key);
  return typeof value === "boolean" ? value : fallback;
}

async function readNumber(key: string, fallback: number): Promise<number> {
  const value: unknown = await api.v1.config.get(key);
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : fallback;
}

/** The Engine's runtime settings, read fresh each time so toggling the Engine
 *  takes effect on the next generation rather than the next session. */
export async function readEngineSettings(): Promise<EngineSettings> {
  return {
    enabled: await readBoolean("engine_enabled", ENGINE_DEFAULTS.enabled),
    delayMs: await readNumber("engine_delay_ms", ENGINE_DEFAULTS.delayMs),
    minProse: await readNumber("engine_min_prose", ENGINE_DEFAULTS.minProse),
  };
}

// ─────────────────────────── SEAM: the pass body ───────────────────────────
//
// Task 7 replaces this body with the real pass: check canStartPass, read the
// sections past the watermark, assess, triage through genX, dedupe into the
// queue, persist watermark and queue, and mirror LoopState into the store. It
// keeps this signature and this callsite — the trigger above does not change.
//
// Until then the wakeup is observable and free.
async function runPass(_deps: EngineLoopDeps): Promise<void> {
  api.v1.log("[engine] wakeup fired");
}

export function registerEngineLoopEffects(deps: EngineLoopDeps): void {
  // True from the moment a wakeup is armed until it fires. The window closes
  // when the pass STARTS, not when it finishes: "at most once per delay window"
  // is a statement about the timer, and a pass that outlives its own window has
  // Task 7's canStartPass re-entry guard underneath it. Holding the flag across
  // the pass instead would drop wakeups for prose written while it ran.
  let pending = false;

  api.v1.hooks.register(
    "onGenerationRequested",
    async ({ scriptInitiated }) => {
      // The Engine's own generations must not wake the Engine.
      if (scriptInitiated) return;
      // Claimed BEFORE the config read, not after: two generations dispatched
      // in the same tick both reach the await, and a flag set on the far side
      // of it would arm two wakeups for one burst.
      if (pending) return;
      pending = true;

      const settings = await readEngineSettings();
      if (!settings.enabled) {
        pending = false;
        return;
      }

      void api.v1.timers.setTimeout(async () => {
        pending = false;
        await runPass(deps);
      }, settings.delayMs);
    },
  );
}
