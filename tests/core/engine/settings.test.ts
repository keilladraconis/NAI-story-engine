// The Engine's settings, and the one thing that matters about them: the slot is
// not trusted.
//
// storyStorage holds JSON some previous version wrote and a Setup form will
// write next. Every hostile shape below has a failure mode behind it — a wakeup
// that lands mid-stream and is refused forever, a NaN handed to
// api.v1.timers.setTimeout, a threshold no backlog can ever reach — so each one
// is asserted to come back usable rather than propagated.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { CREATIVE_MODELS } from "../../../src/core/utils/config";
import {
  CONDENSE_AT_CHARS_MAX,
  CONDENSE_AT_CHARS_MIN,
  DELAY_MS_MAX,
  DELAY_MS_MIN,
  ENGINE_DEFAULTS,
  MIN_PROSE_MAX,
  MIN_PROSE_MIN,
  THREAD_CAP_MAX,
  THREAD_CAP_MIN,
  readEngineSettings,
  writeEngineSettings,
  type EngineSettings,
} from "../../../src/core/engine/settings";
import { PARAGRAPH_CHARS } from "../../../src/core/engine/thread-horizon";
import { STORAGE_KEYS } from "../../../src/core/keys";

/** A real storyStorage, in a Map. Round-trips go through this rather than
 *  through an assertion about `set`, so the write and the read have to agree
 *  about the key as well as the value. */
function installStorageFake(): Map<string, unknown> {
  const slots = new Map<string, unknown>();
  vi.mocked(api.v1.storyStorage.get).mockImplementation(async (key: string) =>
    slots.has(key) ? slots.get(key) : undefined,
  );
  vi.mocked(api.v1.storyStorage.set).mockImplementation(
    async (key: string, value: unknown) => {
      slots.set(key, value);
    },
  );
  return slots;
}

let slots: Map<string, unknown>;

/** Put a raw value in the Engine's slot, as a previous version or a form that
 *  did not parse its input would have left it. */
function stored(value: unknown): void {
  slots.set(STORAGE_KEYS.ENGINE_SETTINGS, value);
}

beforeEach(() => {
  slots = installStorageFake();
});

afterEach(() => {
  vi.mocked(api.v1.storyStorage.get).mockReset();
  vi.mocked(api.v1.storyStorage.get).mockResolvedValue(null);
  vi.mocked(api.v1.storyStorage.set).mockReset();
  vi.mocked(api.v1.storyStorage.set).mockResolvedValue(undefined);
});

describe("readEngineSettings — nothing there", () => {
  it("returns the defaults on a story that has never been configured", async () => {
    expect(await readEngineSettings()).toEqual(ENGINE_DEFAULTS);
  });

  it("defaults off, so a loop nobody asked for spends no budget", async () => {
    expect(ENGINE_DEFAULTS.enabled).toBe(false);
  });

  it.each([
    ["null", null],
    ["a string", "enabled"],
    ["a number", 8000],
    ["an array", [true, 8000, 1, 8]],
  ])("returns the defaults when the slot holds %s", async (_label, value) => {
    stored(value);
    expect(await readEngineSettings()).toEqual(ENGINE_DEFAULTS);
  });

  it("reads the bare key, never the `story:` routing prefix", async () => {
    stored({ enabled: true, delayMs: 3000, minProse: 2, threadCap: 4 });
    await readEngineSettings();
    expect(vi.mocked(api.v1.storyStorage.get)).toHaveBeenCalledWith(
      STORAGE_KEYS.ENGINE_SETTINGS,
    );
    expect(STORAGE_KEYS.ENGINE_SETTINGS).not.toContain("story:");
  });
});

describe("readEngineSettings — a partial record", () => {
  it("keeps what a record has and defaults the rest", async () => {
    stored({ enabled: true });
    expect(await readEngineSettings()).toEqual({
      enabled: true,
      delayMs: ENGINE_DEFAULTS.delayMs,
      minProse: ENGINE_DEFAULTS.minProse,
      threadCap: ENGINE_DEFAULTS.threadCap,
      condenseAtChars: ENGINE_DEFAULTS.condenseAtChars,
      creativeModel: ENGINE_DEFAULTS.creativeModel,
    });
  });

  it("keeps a record written before threads had a cap", async () => {
    // No migration (CLAUDE.md): a v0.14 record has no `threadCap`, and the
    // read is what supplies one rather than a rewrite of the slot.
    stored({ enabled: true, delayMs: 3000, minProse: 2 });
    expect((await readEngineSettings()).threadCap).toBe(
      ENGINE_DEFAULTS.threadCap,
    );
  });

  it("fills a missing `enabled` with off rather than guessing on", async () => {
    stored({ delayMs: 3000, minProse: 2, threadCap: 5, condenseAtChars: 2000 });
    expect(await readEngineSettings()).toEqual({
      enabled: false,
      delayMs: 3000,
      minProse: 2,
      threadCap: 5,
      condenseAtChars: 2000,
      creativeModel: ENGINE_DEFAULTS.creativeModel,
    });
  });

  it("takes a valid record whole", async () => {
    stored({
      enabled: true,
      delayMs: 3000,
      minProse: 4,
      threadCap: 12,
      condenseAtChars: 1600,
      creativeModel: "xialong-v1",
    });
    expect(await readEngineSettings()).toEqual({
      enabled: true,
      delayMs: 3000,
      minProse: 4,
      threadCap: 12,
      condenseAtChars: 1600,
      creativeModel: "xialong-v1",
    });
  });

  it("reads fresh every call, so a change takes effect on the next pass", async () => {
    stored({ enabled: false, delayMs: 3000, minProse: 1 });
    expect((await readEngineSettings()).enabled).toBe(false);
    stored({ enabled: true, delayMs: 3000, minProse: 1 });
    expect((await readEngineSettings()).enabled).toBe(true);
  });
});

describe("readEngineSettings — hostile values", () => {
  it.each([
    ["a string", "true"],
    ["a number", 1],
    ["null", null],
  ])("defaults `enabled` when it is %s", async (_label, value) => {
    stored({ enabled: value, delayMs: 3000, minProse: 2, threadCap: 8 });
    expect((await readEngineSettings()).enabled).toBe(ENGINE_DEFAULTS.enabled);
  });

  it.each([
    ["zero", 0],
    ["negative", -1],
    ["a fraction of a millisecond", 0.5],
  ])(
    "raises a `delayMs` of %s to the floor — a wakeup inside the writer's own generation is refused every time",
    async (_label, value) => {
      stored({ delayMs: value });
      expect((await readEngineSettings()).delayMs).toBe(DELAY_MS_MIN);
    },
  );

  it("lowers an out-of-reach `delayMs` to the ceiling, so the wakeup still arrives", async () => {
    stored({ delayMs: 86_400_000 });
    expect((await readEngineSettings()).delayMs).toBe(DELAY_MS_MAX);
  });

  it.each([
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["-Infinity", Number.NEGATIVE_INFINITY],
    ["a string that looks like a number", "8000"],
    ["a string", "soon"],
    ["null", null],
    ["an object", { ms: 8000 }],
  ])(
    "defaults `delayMs` when it is %s rather than handing it to setTimeout",
    async (_label, value) => {
      stored({ delayMs: value });
      const { delayMs } = await readEngineSettings();
      expect(delayMs).toBe(ENGINE_DEFAULTS.delayMs);
      expect(Number.isFinite(delayMs)).toBe(true);
    },
  );

  it.each([
    ["zero", 0],
    ["negative", -3],
  ])(
    "raises a `minProse` of %s to 1 — below that a pass spends a triage generation on nothing",
    async (_label, value) => {
      stored({ minProse: value });
      expect((await readEngineSettings()).minProse).toBe(MIN_PROSE_MIN);
    },
  );

  it("lowers a `minProse` no backlog could reach to the ceiling", async () => {
    stored({ minProse: 1_000_000 });
    expect((await readEngineSettings()).minProse).toBe(MIN_PROSE_MAX);
  });

  it("rounds a fractional `minProse` up to the backlog that actually clears it", async () => {
    stored({ minProse: 2.5 });
    expect((await readEngineSettings()).minProse).toBe(3);
  });

  it.each([
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["a string that looks like a number", "4"],
    ["a boolean", true],
  ])("defaults `minProse` when it is %s", async (_label, value) => {
    stored({ minProse: value });
    expect((await readEngineSettings()).minProse).toBe(
      ENGINE_DEFAULTS.minProse,
    );
  });

  it.each([
    ["zero", 0],
    ["negative", -2],
  ])(
    "raises a `threadCap` of %s to 1 — a cap of zero makes [THREAD] a silent no-op",
    async (_label, value) => {
      stored({ threadCap: value });
      expect((await readEngineSettings()).threadCap).toBe(THREAD_CAP_MIN);
    },
  );

  it("lowers a `threadCap` that has stopped capping to the ceiling", async () => {
    stored({ threadCap: 5000 });
    expect((await readEngineSettings()).threadCap).toBe(THREAD_CAP_MAX);
  });

  it("rounds a fractional `threadCap` DOWN to the count it actually allows", async () => {
    // The gate admits a new thread while the list is shorter than the cap, so
    // 8.5 already behaves as 8. Rounding down normalises the number without
    // changing what it does; rounding up would quietly raise the ceiling.
    stored({ threadCap: 8.5 });
    expect((await readEngineSettings()).threadCap).toBe(8);
  });

  it.each([
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["a string that looks like a number", "8"],
    ["a boolean", true],
    ["null", null],
  ])("defaults `threadCap` when it is %s", async (_label, value) => {
    stored({ threadCap: value });
    expect((await readEngineSettings()).threadCap).toBe(
      ENGINE_DEFAULTS.threadCap,
    );
  });

  it("never returns a settings object a pass cannot use", async () => {
    stored({
      enabled: "yes",
      delayMs: -0,
      minProse: Number.NaN,
      threadCap: Number.POSITIVE_INFINITY,
      condenseAtChars: "2000",
    });
    const settings = await readEngineSettings();
    expect(typeof settings.enabled).toBe("boolean");
    expect(settings.delayMs).toBeGreaterThanOrEqual(DELAY_MS_MIN);
    expect(settings.delayMs).toBeLessThanOrEqual(DELAY_MS_MAX);
    expect(settings.minProse).toBeGreaterThanOrEqual(MIN_PROSE_MIN);
    expect(Number.isInteger(settings.minProse)).toBe(true);
    expect(settings.threadCap).toBeGreaterThanOrEqual(THREAD_CAP_MIN);
    expect(settings.threadCap).toBeLessThanOrEqual(THREAD_CAP_MAX);
    expect(Number.isInteger(settings.threadCap)).toBe(true);
    expect(settings.condenseAtChars).toBeGreaterThanOrEqual(
      CONDENSE_AT_CHARS_MIN,
    );
    expect(settings.condenseAtChars).toBeLessThanOrEqual(CONDENSE_AT_CHARS_MAX);
    expect(Number.isInteger(settings.condenseAtChars)).toBe(true);
  });
});

describe("writeEngineSettings", () => {
  it("round-trips a settings object through storage", async () => {
    const next: EngineSettings = {
      enabled: true,
      delayMs: 12_000,
      minProse: 3,
      threadCap: 5,
      condenseAtChars: 1600,
      creativeModel: "xialong-v1",
    };
    await writeEngineSettings(next);
    expect(await readEngineSettings()).toEqual(next);
  });

  it("writes one record under the Engine's key, not three", async () => {
    await writeEngineSettings({
      enabled: true,
      delayMs: 12_000,
      minProse: 3,
      threadCap: 5,
      condenseAtChars: 1600,
      creativeModel: "xialong-v1",
    });
    const keys = vi
      .mocked(api.v1.storyStorage.set)
      .mock.calls.map((call) => call[0]);
    expect(keys).toEqual([STORAGE_KEYS.ENGINE_SETTINGS]);
  });

  it("stores the clamped value, so the slot never holds a number the read has to repair", async () => {
    await writeEngineSettings({
      enabled: true,
      delayMs: -1,
      minProse: 0,
      threadCap: 999,
      creativeModel: "xialong-v1",
      condenseAtChars: 0,
    });
    expect(slots.get(STORAGE_KEYS.ENGINE_SETTINGS)).toEqual({
      enabled: true,
      delayMs: DELAY_MS_MIN,
      minProse: MIN_PROSE_MIN,
      threadCap: THREAD_CAP_MAX,
      condenseAtChars: CONDENSE_AT_CHARS_MIN,
      creativeModel: "xialong-v1",
    });
  });
});

describe("the condense threshold is a size in characters", () => {
  it("defaults to five of the house paragraph, well clear of a generated entry", async () => {
    // §5.1's counterweight only makes sense above the size a lorebook entry is
    // BORN at: the Generate Content button writes one or two paragraphs, and a
    // threshold under that would mark every fresh entry as sprawl. Five
    // paragraphs (~500 tokens) is where one entry costs as much context as a
    // whole scene of the recent prose it is competing with (§4.3).
    expect(ENGINE_DEFAULTS.condenseAtChars).toBe(5 * PARAGRAPH_CHARS);
    expect(await readEngineSettings()).toEqual(ENGINE_DEFAULTS);
  });

  it("keeps the default inside its own bounds", () => {
    expect(ENGINE_DEFAULTS.condenseAtChars).toBeGreaterThanOrEqual(
      CONDENSE_AT_CHARS_MIN,
    );
    expect(ENGINE_DEFAULTS.condenseAtChars).toBeLessThanOrEqual(
      CONDENSE_AT_CHARS_MAX,
    );
  });

  it.each([0, -1, 10, PARAGRAPH_CHARS])(
    "raises a threshold of %s that every entry already clears",
    async (value) => {
      // A threshold below what an entry is generated at makes every managed
      // entity a permanent condense candidate, and every pass a rewrite queue
      // that starves the revises §5 exists for.
      stored({ condenseAtChars: value });
      expect((await readEngineSettings()).condenseAtChars).toBe(
        CONDENSE_AT_CHARS_MIN,
      );
    },
  );

  it("lowers a threshold nothing would ever cross", async () => {
    stored({ condenseAtChars: 500_000 });
    expect((await readEngineSettings()).condenseAtChars).toBe(
      CONDENSE_AT_CHARS_MAX,
    );
  });

  it("rounds a fractional threshold to a whole character", async () => {
    stored({ condenseAtChars: 2000.4 });
    expect((await readEngineSettings()).condenseAtChars).toBe(2000);
  });

  it.each([
    ["missing", undefined],
    ["a string", "2000"],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
  ])("defaults the threshold when it is %s", async (_label, value) => {
    stored({ condenseAtChars: value });
    expect((await readEngineSettings()).condenseAtChars).toBe(
      ENGINE_DEFAULTS.condenseAtChars,
    );
  });
});

describe("the creative model", () => {
  // settings.ts cannot import CREATIVE_MODELS: config.ts imports
  // readEngineSettings from settings.ts, so a value import back would close a
  // cycle. The id list is therefore duplicated, and this is what stops the two
  // copies drifting — a model added to the picker but not to the normalizer
  // would be silently reset to the default on every load.
  it("normalizes every model the picker offers", async () => {
    expect(CREATIVE_MODELS.length).toBeGreaterThan(1);
    for (const model of CREATIVE_MODELS) {
      stored({ creativeModel: model.id });
      expect((await readEngineSettings()).creativeModel).toBe(model.id);
    }
  });

  it("refuses an id this build does not know", async () => {
    // Not a nearest match: generating against an unknown id fails at the API,
    // and a story silently switched to a model the writer did not pick is
    // worse than one that reads as unconfigured.
    stored({ creativeModel: "erato-v3" });
    expect((await readEngineSettings()).creativeModel).toBe(
      ENGINE_DEFAULTS.creativeModel,
    );
  });

  it("defaults to a model every subscription can reach", async () => {
    // Defaulting to Xialong would hand a writer without Opus a story whose
    // every generation fails until they find this setting.
    expect(ENGINE_DEFAULTS.creativeModel).toBe("glm-4-6");
  });
});
