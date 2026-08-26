// What a typed number means, for the Engine section's number fields.
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
// This module also owns every unit conversion in the form. The delay is stored
// in milliseconds — the bounds, the timer and `settings.ts` are all in ms and
// none of them should learn a second unit — but a writer thinks "about eight
// seconds", not "8000", and `8000` in a box labelled `ms` is exactly the
// power-user presentation these settings left `project.yaml` to escape. So the
// box speaks seconds and storage keeps milliseconds.
//
// The condense threshold is the second of them, and it is why the note above
// says "every" rather than "the one": it is stored in characters, because that
// is what the trigger measures a lorebook entry in, and typed in PARAGRAPHS,
// because the question a writer is actually answering is how much of their
// context one entry may eat — and the house already reasons about that in
// 400-character paragraphs (§4.3, `PARAGRAPH_CHARS`).
//
// A conversion is in `resolveTypedSetting` AND in `draftFor`, and it has to be
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
import { PARAGRAPH_CHARS } from "../../../core/engine/thread-horizon";

/** The numeric settings — the ones the form exposes as text a writer can type
 *  anything into. `enabled` is a button and has no draft.
 *
 *  A value, not just a type, and the form builds one field per entry: a numeric
 *  setting that is in `EngineSettings` but not in here is a setting reachable
 *  only by hand-editing storyStorage, which is exactly what §3.1 moved these
 *  settings out of read-only `project.yaml` to avoid. `threadCap` shipped that
 *  way for one task; `engine-settings-model.test.ts` derives the list from
 *  `ENGINE_DEFAULTS` so the next one cannot. */
export const NUMERIC_SETTINGS = [
  "delayMs",
  "minProse",
  "threadCap",
  "condenseAtChars",
] as const;

export type NumericSetting = (typeof NUMERIC_SETTINGS)[number];

/** How many stored units one typed unit is worth. The delay is typed in seconds
 *  and stored in milliseconds; the condense threshold is typed in paragraphs and
 *  stored in characters; the paragraph count and the thread cap are counts
 *  either way, and saying so with a 1 keeps them inside the same table rather
 *  than as special cases somewhere else. A `Record` so a new numeric setting
 *  cannot be added without an answer here — the failure it prevents is a count
 *  quietly scaled by a thousand and clamped to its ceiling. */
const STORED_PER_TYPED: Record<NumericSetting, number> = {
  delayMs: 1000,
  minProse: 1,
  threadCap: 1,
  condenseAtChars: PARAGRAPH_CHARS,
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

  // Spread, not a per-field branch: an arm per setting is an arm to forget, and
  // the one that was forgotten is why `threadCap` had no control. Every field is
  // a number here, and `normalizeEngineSettings` is what decides whether this
  // one is usable.
  return normalizeEngineSettings({ ...settings, [field]: intended });
}
