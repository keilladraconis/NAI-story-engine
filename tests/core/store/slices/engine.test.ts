// `engineSettingsChanged` returns the SAME state object when nothing changed, so
// the HUD does not repaint for a re-read that said the same thing. That is a
// real optimisation and also the slice's sharpest edge: a field the comparison
// forgets is a field whose change is invisible until the next reload, because
// the store never notifies and the form renders from the store.
//
// Observed: switching the creative model wrote storage and left the picker
// showing the old choice until the page was refreshed. `condenseAtChars` had
// the same defect and nobody had noticed.
import { describe, it, expect } from "vitest";
import {
  engineSliceReducer,
  initialEngineState,
  engineSettingsChanged,
} from "../../../../src/core/store/slices/engine";
import { ENGINE_DEFAULTS } from "../../../../src/core/engine/settings";
import type { EngineSettings } from "../../../../src/core/engine/settings";

/** A value for every field that differs from the default, whatever its type. */
const CHANGED: EngineSettings = {
  enabled: !ENGINE_DEFAULTS.enabled,
  delayMs: ENGINE_DEFAULTS.delayMs + 1000,
  minProse: ENGINE_DEFAULTS.minProse + 1,
  threadCap: ENGINE_DEFAULTS.threadCap + 1,
  condenseAtChars: ENGINE_DEFAULTS.condenseAtChars + 400,
  creativeModel: "xialong-v1",
};

describe("engineSettingsChanged", () => {
  it("notifies for a change to ANY field, not a listed few", () => {
    // Derived from the settings object itself: a field added to EngineDefaults
    // is covered here the day it lands. A hardcoded list is what shipped the
    // bug, and a hardcoded list in the test would have passed alongside it.
    const fields = Object.keys(ENGINE_DEFAULTS) as (keyof EngineSettings)[];
    expect(fields.length).toBeGreaterThan(4);

    for (const field of fields) {
      const next = { ...ENGINE_DEFAULTS, [field]: CHANGED[field] };
      expect(next[field], `${field} must differ to be a real test`).not.toBe(
        ENGINE_DEFAULTS[field],
      );
      const before = { ...initialEngineState, settings: ENGINE_DEFAULTS };
      const after = engineSliceReducer(before, engineSettingsChanged(next));
      expect(after, `changing ${field} must produce new state`).not.toBe(
        before,
      );
      expect(after.settings[field]).toBe(CHANGED[field]);
    }
  });

  it("returns the same state when nothing changed", () => {
    const before = { ...initialEngineState, settings: ENGINE_DEFAULTS };
    const after = engineSliceReducer(
      before,
      engineSettingsChanged({ ...ENGINE_DEFAULTS }),
    );
    expect(after).toBe(before);
  });
});
