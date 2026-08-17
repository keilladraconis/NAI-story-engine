import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  registerEngineLoopEffects,
  readEngineSettings,
  ENGINE_DEFAULTS,
  type EngineLoopDeps,
} from "../../../src/core/store/effects/engine-loop";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/** The trigger touches none of these — it hands them straight to the pass body
 *  Task 7 fills in — so a stub with the right shape is all a test needs. */
const DEPS = {
  subscribeEffect: (() => () => {}) as EngineLoopDeps["subscribeEffect"],
  dispatch: (() => {}) as EngineLoopDeps["dispatch"],
  getState: (() => ({})) as unknown as EngineLoopDeps["getState"],
  genX: {} as EngineLoopDeps["genX"],
} satisfies EngineLoopDeps;

type GenerationRequest = {
  continuityId: string;
  model: string;
  scriptInitiated: boolean;
};

/** Grab the single onGenerationRequested callback the effect registered. */
function registeredHook(): (p: GenerationRequest) => Promise<void> {
  const entry = vi
    .mocked(api.v1.hooks.register)
    .mock.calls.filter((c) => c[0] === "onGenerationRequested")
    .pop();
  return entry?.[1] as (p: GenerationRequest) => Promise<void>;
}

/** A generation request as the harness delivers it. */
function generation(scriptInitiated = false): GenerationRequest {
  return { continuityId: "c1", model: "glm-4-6", scriptInitiated };
}

function configure(values: Record<string, unknown>): void {
  vi.mocked(api.v1.config.get).mockImplementation(async (key: string) =>
    key in values ? values[key] : undefined,
  );
}

/** Wakeups armed so far, as the timer calls that armed them. */
function wakeups(): Array<[unknown, unknown]> {
  return vi.mocked(api.v1.timers.setTimeout).mock.calls as Array<
    [unknown, unknown]
  >;
}

describe("engine trigger", () => {
  beforeEach(() => {
    vi.mocked(api.v1.hooks.register).mockClear();
    vi.mocked(api.v1.timers.setTimeout).mockClear();
    vi.mocked(api.v1.log).mockClear();
    configure({ engine_enabled: true });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.mocked(api.v1.config.get).mockReset();
    vi.mocked(api.v1.config.get).mockResolvedValue(undefined);
  });

  it("registers exactly one onGenerationRequested callback", () => {
    registerEngineLoopEffects(DEPS);
    const calls = vi
      .mocked(api.v1.hooks.register)
      .mock.calls.filter((c) => c[0] === "onGenerationRequested");
    expect(calls).toHaveLength(1);
  });

  it("arms exactly one wakeup for a user generation", async () => {
    registerEngineLoopEffects(DEPS);
    await registeredHook()(generation());
    expect(wakeups()).toHaveLength(1);
    expect(wakeups()[0][1]).toBe(ENGINE_DEFAULTS.delayMs);
  });

  it("uses the configured delay", async () => {
    configure({ engine_enabled: true, engine_delay_ms: 1500 });
    registerEngineLoopEffects(DEPS);
    await registeredHook()(generation());
    expect(wakeups()[0][1]).toBe(1500);
  });

  it("does not re-arm while a wakeup is pending", async () => {
    // A writer generating faster than the delay must not stack passes — the
    // window is anchored to the first generation of the burst.
    registerEngineLoopEffects(DEPS);
    const hook = registeredHook();
    await hook(generation());
    await hook(generation());
    await hook(generation());
    expect(wakeups()).toHaveLength(1);
  });

  it("does not re-arm for generations that land in the same tick", async () => {
    // The pending flag is claimed before the config read. Set on the far side
    // of that await, both of these would sail past the check and arm two
    // wakeups for one burst.
    registerEngineLoopEffects(DEPS);
    const hook = registeredHook();
    await Promise.all([hook(generation()), hook(generation())]);
    expect(wakeups()).toHaveLength(1);
  });

  it("arms nothing for a script-initiated generation", async () => {
    // Load-bearing: the Engine's own generations come through this hook, and
    // without the filter every pass re-arms the wakeup that started it.
    registerEngineLoopEffects(DEPS);
    await registeredHook()(generation(true));
    expect(wakeups()).toEqual([]);
  });

  it("arms nothing when the Engine is disabled", async () => {
    configure({ engine_enabled: false });
    registerEngineLoopEffects(DEPS);
    await registeredHook()(generation());
    expect(wakeups()).toEqual([]);
  });

  it("is off when engine_enabled has never been set", async () => {
    configure({});
    registerEngineLoopEffects(DEPS);
    await registeredHook()(generation());
    expect(wakeups()).toEqual([]);
  });

  it("re-arms once the wakeup has fired", async () => {
    // The window closes when the pass starts, so prose written after it is not
    // dropped — the next generation gets its own wakeup.
    registerEngineLoopEffects(DEPS);
    const hook = registeredHook();
    await hook(generation());
    await vi.runAllTimersAsync();
    await hook(generation());
    expect(wakeups()).toHaveLength(2);
  });

  it("never stops the writer's generation", async () => {
    // The hook may return { stopGeneration: true }. Returning nothing is the
    // whole contract here: the Engine observes, it does not interfere.
    registerEngineLoopEffects(DEPS);
    expect(await registeredHook()(generation())).toBeUndefined();
  });
});

describe("engine settings", () => {
  afterEach(() => {
    vi.mocked(api.v1.config.get).mockReset();
    vi.mocked(api.v1.config.get).mockResolvedValue(undefined);
  });

  it("falls back to the defaults for missing or malformed values", async () => {
    configure({ engine_delay_ms: "soon", engine_min_prose: -3 });
    expect(await readEngineSettings()).toEqual({
      enabled: false,
      delayMs: ENGINE_DEFAULTS.delayMs,
      minProse: ENGINE_DEFAULTS.minProse,
    });
  });

  it("reads what the writer configured", async () => {
    configure({
      engine_enabled: true,
      engine_delay_ms: 3000,
      engine_min_prose: 4,
    });
    expect(await readEngineSettings()).toEqual({
      enabled: true,
      delayMs: 3000,
      minProse: 4,
    });
  });
});

describe("onGenerationRequested has exactly one home", () => {
  const SRC = join(__dirname, "../../../src");

  function files(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) return files(full);
      return full.endsWith(".ts") || full.endsWith(".tsx") ? [full] : [];
    });
  }

  it("is registered in engine-loop.ts and nowhere else", () => {
    // api.v1.hooks.register holds one callback per hook name — a second
    // registration silently replaces the first, and the Engine just stops
    // waking with nothing to show for it.
    const offenders = files(SRC).filter(
      (f) =>
        readFileSync(f, "utf8").includes('register("onGenerationRequested"') &&
        !f.endsWith("engine-loop.ts"),
    );
    expect(offenders).toEqual([]);
  });

  it("is wired into registerEffects", () => {
    // The guard above only proves the registration exists in a module. Nothing
    // imports engine-loop for its side effects, so deleting the call below is a
    // silent, all-tests-green way to disconnect the Engine entirely.
    const wiring = readFileSync(
      join(SRC, "core/store/register-effects.ts"),
      "utf8",
    );
    expect(wiring).toContain("registerEngineLoopEffects(");
  });
});
