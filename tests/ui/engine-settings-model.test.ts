// What the Engine section's number fields do with what a writer types.
//
// The bounds themselves belong to `src/core/engine/settings.ts` and are tested
// there against real storage; nothing here restates one. What is tested here is
// the form's own decision, which the storage module has no opinion about: a
// number too far is intent and gets clamped, but text that is not a number at
// all is not a request to change anything, so the setting the writer already had
// survives it. Storage would have answered "the default" — which for a form
// means quietly discarding a good value because someone cleared the box.
import { describe, it, expect } from "vitest";
import { resolveTypedSetting } from "../../src/ui/panels/setup/engine-settings-model";
import {
  DELAY_MS_MAX,
  DELAY_MS_MIN,
  ENGINE_DEFAULTS,
  MIN_PROSE_MAX,
  MIN_PROSE_MIN,
  type EngineSettings,
} from "../../src/core/engine/settings";

/** A configured story: every field away from its default, so a test that gets
 *  back a default is unambiguously getting back a default. */
const CONFIGURED: EngineSettings = {
  enabled: true,
  delayMs: 3000,
  minProse: 4,
};

describe("a typed number that is a number", () => {
  it("is taken as typed when it is in range", () => {
    expect(resolveTypedSetting(CONFIGURED, "delayMs", "5000").delayMs).toBe(
      5000,
    );
    expect(resolveTypedSetting(CONFIGURED, "minProse", "7").minProse).toBe(7);
  });

  it("is clamped, not rejected, when it is out of range", () => {
    // Intent expressed too far is still intent: keep the direction, take the
    // bound. Both ends, both fields.
    expect(resolveTypedSetting(CONFIGURED, "delayMs", "0").delayMs).toBe(
      DELAY_MS_MIN,
    );
    expect(resolveTypedSetting(CONFIGURED, "delayMs", "-1").delayMs).toBe(
      DELAY_MS_MIN,
    );
    expect(resolveTypedSetting(CONFIGURED, "delayMs", "80000000").delayMs).toBe(
      DELAY_MS_MAX,
    );
    expect(resolveTypedSetting(CONFIGURED, "minProse", "0").minProse).toBe(
      MIN_PROSE_MIN,
    );
    expect(resolveTypedSetting(CONFIGURED, "minProse", "9999").minProse).toBe(
      MIN_PROSE_MAX,
    );
  });

  it("ignores the whitespace around it", () => {
    expect(resolveTypedSetting(CONFIGURED, "delayMs", "  5000  ").delayMs).toBe(
      5000,
    );
  });

  it("is rounded the way the loop reads it", () => {
    // Straight to a timer, so delayMs rounds to nearest; the gate skips while
    // `backlog < minProse`, so 2.5 already behaves as 3 and rounds up.
    expect(resolveTypedSetting(CONFIGURED, "delayMs", "5000.4").delayMs).toBe(
      5000,
    );
    expect(resolveTypedSetting(CONFIGURED, "minProse", "2.5").minProse).toBe(3);
  });
});

describe("a typed value that is not a number", () => {
  // The judgement call this form makes, stated four ways. Storage's answer to a
  // non-number is ENGINE_DEFAULTS; the form's is "you did not ask for anything",
  // because the writer can see the box and the box was full a moment ago.
  const notNumbers = ["", "   ", "abc", "8000ms", "--"];

  it("leaves the stored delay exactly where it was", () => {
    for (const draft of notNumbers) {
      expect(resolveTypedSetting(CONFIGURED, "delayMs", draft).delayMs).toBe(
        CONFIGURED.delayMs,
      );
    }
    // Not the default, which is what a bare `normalizeEngineSettings` would
    // have given back — the distinction this function exists for.
    expect(CONFIGURED.delayMs).not.toBe(ENGINE_DEFAULTS.delayMs);
  });

  it("leaves the stored minimum exactly where it was", () => {
    for (const draft of notNumbers) {
      expect(resolveTypedSetting(CONFIGURED, "minProse", draft).minProse).toBe(
        CONFIGURED.minProse,
      );
    }
    expect(CONFIGURED.minProse).not.toBe(ENGINE_DEFAULTS.minProse);
  });

  it("treats an empty box as no request, not as zero", () => {
    // `Number("")` is 0, which would otherwise read as an intent to set zero and
    // clamp to the floor — an emptied field would silently rewrite the setting.
    expect(resolveTypedSetting(CONFIGURED, "delayMs", "").delayMs).not.toBe(
      DELAY_MS_MIN,
    );
  });

  it("keeps a number that overflows to Infinity from erasing the setting", () => {
    expect(resolveTypedSetting(CONFIGURED, "delayMs", "1e999").delayMs).toBe(
      CONFIGURED.delayMs,
    );
  });
});

describe("the other settings are carried across untouched", () => {
  it("never moves the field it was not asked about", () => {
    const afterDelay = resolveTypedSetting(CONFIGURED, "delayMs", "9000");
    expect(afterDelay.enabled).toBe(true);
    expect(afterDelay.minProse).toBe(CONFIGURED.minProse);

    const afterProse = resolveTypedSetting(CONFIGURED, "minProse", "9");
    expect(afterProse.enabled).toBe(true);
    expect(afterProse.delayMs).toBe(CONFIGURED.delayMs);
  });

  it("returns a whole settings object, which is what the save writes", () => {
    // The commit path writes and dispatches this value entire, so a missing
    // field here would be a field wiped in storage.
    expect(
      Object.keys(resolveTypedSetting(CONFIGURED, "delayMs", "9000")).sort(),
    ).toEqual(["delayMs", "enabled", "minProse"]);
  });
});
