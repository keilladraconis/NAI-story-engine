// What the Engine section's number fields do with what a writer types.
//
// The bounds themselves belong to `src/core/engine/settings.ts` and are tested
// there against real storage; nothing here restates one. What is tested here is
// the form's own decision, which the storage module has no opinion about: a
// number too far is intent and gets clamped, but text that is not a number at
// all is not a request to change anything, so the setting the writer already had
// survives it. Storage would have answered "the default" — which for a form
// means quietly discarding a good value because someone cleared the box.
//
// The other thing tested here is the unit. The delay is TYPED in seconds and
// STORED in milliseconds, and that conversion has to happen in both directions
// or the form breaks its own guarantee that the number left in the box is the
// number in use. `resolveTypedSetting` is one direction, `draftFor` the other,
// and the round trip below fails if either one of them stops converting.
import { describe, it, expect } from "vitest";
import {
  draftFor,
  resolveTypedSetting,
  toTyped,
} from "../../src/ui/panels/setup/engine-settings-model";
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
  threadCap: 5,
};

/** The delay's bounds in the unit the box shows them in: 1s and 300s. Derived,
 *  never restated — a bound that moves in `settings.ts` moves here with it. */
const DELAY_S_MIN = DELAY_MS_MIN / 1000;

describe("a typed number that is a number", () => {
  it("is taken as typed when it is in range", () => {
    // Seconds in, milliseconds out: the writer types 5, the timer gets 5000.
    expect(resolveTypedSetting(CONFIGURED, "delayMs", "5").delayMs).toBe(5000);
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
    // 0.2s is 200ms — under the floor, and a fraction is exactly how a writer
    // would express "too fast" now that the box takes seconds.
    expect(resolveTypedSetting(CONFIGURED, "delayMs", "0.2").delayMs).toBe(
      DELAY_MS_MIN,
    );
    expect(resolveTypedSetting(CONFIGURED, "delayMs", "80000").delayMs).toBe(
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
    expect(resolveTypedSetting(CONFIGURED, "delayMs", "  5  ").delayMs).toBe(
      5000,
    );
  });

  it("is rounded the way the loop reads it", () => {
    // Straight to a timer, so delayMs rounds to the nearest whole millisecond;
    // the gate skips while `backlog < minProse`, so 2.5 already behaves as 3 and
    // rounds up.
    expect(resolveTypedSetting(CONFIGURED, "delayMs", "5.0004").delayMs).toBe(
      5000,
    );
    expect(resolveTypedSetting(CONFIGURED, "minProse", "2.5").minProse).toBe(3);
  });

  it("takes a fractional number of seconds at its word", () => {
    // 4.5 is a legitimate thing to type in a box labelled seconds, and it lands
    // on a whole millisecond, so nothing rounds it away.
    expect(resolveTypedSetting(CONFIGURED, "delayMs", "4.5").delayMs).toBe(
      4500,
    );
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

  it("keeps a number that only overflows once it is scaled", () => {
    // 1e308 is finite; 1e308 seconds in milliseconds is not. The finite check
    // has to run after the conversion, or this resolves to the storage module's
    // default and silently discards a setting the writer never touched.
    expect(resolveTypedSetting(CONFIGURED, "delayMs", "1e308").delayMs).toBe(
      CONFIGURED.delayMs,
    );
  });
});

describe("the box shows seconds and storage keeps milliseconds", () => {
  // The round trip, in one place: type a value, read what is stored, and check
  // the box shows the STORED value converted back. Applying the conversion in
  // only one of the two directions fails this — typed→stored alone leaves the
  // box reading 4000 for four seconds, stored→typed alone stores 4ms and hands
  // back the floor.
  it("stores what was typed in seconds and shows it back in seconds", () => {
    const stored = resolveTypedSetting(CONFIGURED, "delayMs", "4");
    expect(stored.delayMs).toBe(4000);
    expect(draftFor(stored, "delayMs")).toBe("4");
  });

  it("shows the clamped value, not the one that was typed", () => {
    // Typing 0.2 stores 1000ms; the box must then read 1, not 0.2.
    const stored = resolveTypedSetting(CONFIGURED, "delayMs", "0.2");
    expect(stored.delayMs).toBe(DELAY_MS_MIN);
    expect(draftFor(stored, "delayMs")).toBe(String(DELAY_S_MIN));
    expect(draftFor(stored, "delayMs")).toBe("1");
  });

  it("round-trips a fractional value without inventing precision", () => {
    const stored = resolveTypedSetting(CONFIGURED, "delayMs", "4.5");
    expect(stored.delayMs).toBe(4500);
    expect(draftFor(stored, "delayMs")).toBe("4.5");
  });

  it("shows the default delay as eight seconds, not eight thousand", () => {
    // The number a story that was never configured opens with — the whole
    // reason the unit changed.
    expect(draftFor(ENGINE_DEFAULTS, "delayMs")).toBe("8");
  });

  it("leaves the paragraph count in the one unit it has", () => {
    expect(draftFor(CONFIGURED, "minProse")).toBe("4");
    expect(toTyped("minProse", MIN_PROSE_MAX)).toBe(MIN_PROSE_MAX);
    const stored = resolveTypedSetting(CONFIGURED, "minProse", "7");
    expect(stored.minProse).toBe(7);
    expect(draftFor(stored, "minProse")).toBe("7");
  });

  it("converts the bounds the form prints, rather than restating them", () => {
    expect(toTyped("delayMs", DELAY_MS_MIN)).toBe(1);
    expect(toTyped("delayMs", DELAY_MS_MAX)).toBe(300);
  });
});

describe("the other settings are carried across untouched", () => {
  it("never moves the field it was not asked about", () => {
    const afterDelay = resolveTypedSetting(CONFIGURED, "delayMs", "9");
    expect(afterDelay.enabled).toBe(true);
    expect(afterDelay.minProse).toBe(CONFIGURED.minProse);
    expect(afterDelay.threadCap).toBe(CONFIGURED.threadCap);

    const afterProse = resolveTypedSetting(CONFIGURED, "minProse", "9");
    expect(afterProse.enabled).toBe(true);
    expect(afterProse.delayMs).toBe(CONFIGURED.delayMs);
    expect(afterProse.threadCap).toBe(CONFIGURED.threadCap);
  });

  it("returns a whole settings object, which is what the save writes", () => {
    // The commit path writes and dispatches this value entire, so a missing
    // field here would be a field wiped in storage.
    expect(
      Object.keys(resolveTypedSetting(CONFIGURED, "delayMs", "9")).sort(),
    ).toEqual(["delayMs", "enabled", "minProse", "threadCap"]);
  });
});
