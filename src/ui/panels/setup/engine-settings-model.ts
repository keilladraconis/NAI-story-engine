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
//
// This module also owns the ONE unit conversion in the form. The delay is stored
// in milliseconds — the bounds, the timer and `settings.ts` are all in ms and
// none of them should learn a second unit — but a writer thinks "about eight
// seconds", not "8000", and `8000` in a box labelled `ms` is exactly the
// power-user presentation these settings left `project.yaml` to escape. So the
// box speaks seconds and storage keeps milliseconds.
//
// The conversion is in `resolveTypedSetting` AND in `draftFor`, and it has to be
// in both or the form breaks the guarantee it was built around: *the number left
// in the box is the number in use*. One without the other is a box showing
// `8000` seconds, or a `4` that stores 4ms and comes back as the floor. Both
// read `STORED_PER_TYPED`, so the two directions cannot disagree about the
// factor — but they are two functions, and the round-trip test in
// `engine-settings-model.test.ts` is what holds them together.

import {
  normalizeEngineSettings,
  type EngineSettings,
} from "../../../core/engine/settings";

/** The numeric settings — the two the form exposes as text a writer can type
 *  anything into. `enabled` is a button and has no draft. */
export type NumericSetting = "delayMs" | "minProse";

/** How many stored units one typed unit is worth. The delay is typed in seconds
 *  and stored in milliseconds; the paragraph count is a count either way, and
 *  saying so with a 1 keeps it inside the same table rather than as a special
 *  case somewhere else. */
const STORED_PER_TYPED: Record<NumericSetting, number> = {
  delayMs: 1000,
  minProse: 1,
};

/** A stored value in the unit the box shows it in — 8000ms → 8. */
export function toTyped(field: NumericSetting, stored: number): number {
  return stored / STORED_PER_TYPED[field];
}

/** What the box should hold for these settings: the STORED value, converted
 *  back. Never the text that was typed — a clamp moves the stored number and the
 *  box has to follow it, which is the whole point of `resolveTypedSetting`
 *  returning settings rather than a boolean. */
export function draftFor(
  settings: EngineSettings,
  field: NumericSetting,
): string {
  return String(toTyped(field, settings[field]));
}

/**
 * The settings implied by `draft` typed into `field`, clamped by the storage
 * module's own rules.
 *
 * The result is what the form both stores and shows, so the number the writer
 * reads after a commit is the number the loop will act on — including when it is
 * not the number they typed.
 *
 * `draft` is in the unit the box shows — seconds for the delay — and the result
 * is in the unit the loop uses.
 *
 * - `"3"` → 3000ms, as typed. `"4.5"` → 4500ms: fractional seconds are fine, the
 *   stored number is rounded to a whole millisecond anyway.
 * - `"0.2"` → `DELAY_MS_MIN`. A number too far is still a number; it is clamped.
 * - `""`, `"abc"`, `"1e999"` → the value already in `settings`, unchanged. Not a
 *   number, so not a request. (`Number("")` is 0, which would otherwise read as
 *   an intent to set zero and clamp to the floor — hence the explicit empty
 *   check rather than a bare `Number.isFinite`.) The finite check runs AFTER the
 *   conversion, so a typed number large enough to overflow when scaled takes the
 *   same path rather than resolving to the module's default.
 */
export function resolveTypedSetting(
  settings: EngineSettings,
  field: NumericSetting,
  draft: string,
): EngineSettings {
  const text = draft.trim();
  const typed = Number(text) * STORED_PER_TYPED[field];
  const intended =
    text === "" || !Number.isFinite(typed) ? settings[field] : typed;

  return normalizeEngineSettings(
    field === "delayMs"
      ? { ...settings, delayMs: intended }
      : { ...settings, minProse: intended },
  );
}
