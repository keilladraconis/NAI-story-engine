// What a typed number means, for the Engine section's two number fields.
//
// The storage module already decides what a *stored* value means
// (`normalizeEngineSettings`): a finite number outside its range is intent
// expressed too far, so it is clamped; anything that is not a number at all
// carries no intent, so it takes the default. This is the same split applied to
// a form field, where "no intent" means something different — the writer already
// has a good value in the slot, and replacing it with the module's default
// because they cleared the box and tabbed away would throw away a setting they
// never asked to lose. So here, no intent means **keep what is stored**.
//
// Nothing else in the form decides anything about a number: the bounds are never
// restated, only `normalizeEngineSettings` applies them, so a bound that moves in
// `settings.ts` moves here with it.

import {
  normalizeEngineSettings,
  type EngineSettings,
} from "../../../core/engine/settings";

/** The numeric settings — the two the form exposes as text a writer can type
 *  anything into. `enabled` is a button and has no draft. */
export type NumericSetting = "delayMs" | "minProse";

/**
 * The settings implied by `draft` typed into `field`, clamped by the storage
 * module's own rules.
 *
 * The result is what the form both stores and shows, so the number the writer
 * reads after a commit is the number the loop will act on — including when it is
 * not the number they typed.
 *
 * - `"3000"` → 3000, as typed.
 * - `"0"` → `DELAY_MS_MIN`. A number too far is still a number; it is clamped.
 * - `""`, `"abc"`, `"1e999"` → the value already in `settings`, unchanged. Not a
 *   number, so not a request. (`Number("")` is 0, which would otherwise read as
 *   an intent to set zero and clamp to the floor — hence the explicit empty
 *   check rather than a bare `Number.isFinite`.)
 */
export function resolveTypedSetting(
  settings: EngineSettings,
  field: NumericSetting,
  draft: string,
): EngineSettings {
  const text = draft.trim();
  const typed = Number(text);
  const intended =
    text === "" || !Number.isFinite(typed) ? settings[field] : typed;

  return normalizeEngineSettings(
    field === "delayMs"
      ? { ...settings, delayMs: intended }
      : { ...settings, minProse: intended },
  );
}
