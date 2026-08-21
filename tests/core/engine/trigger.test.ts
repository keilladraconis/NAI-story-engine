import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  registerEngineLoopEffects,
  type EngineLoopDeps,
} from "../../../src/core/store/effects/engine-loop";
import {
  ENGINE_DEFAULTS,
  type EngineSettings,
} from "../../../src/core/engine/settings";
import { STORAGE_KEYS } from "../../../src/core/keys";
import { initialEngineState } from "../../../src/core/store/slices/engine";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/** The trigger hands all of these to the pass, and calls exactly one of them
 *  itself — `genX.userInteraction`, which it forwards because registering this
 *  hook replaced GenX's own registration of it. Everything else is a stub. */
const DEPS = {
  subscribeEffect: (() => () => {}) as EngineLoopDeps["subscribeEffect"],
  dispatch: (() => {}) as EngineLoopDeps["dispatch"],
  getState: (() => ({
    engine: initialEngineState,
  })) as unknown as EngineLoopDeps["getState"],
  genX: { userInteraction: vi.fn() } as unknown as EngineLoopDeps["genX"],
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

/** Put the Engine's settings where the effect now reads them: one storyStorage
 *  record, not three `api.v1.config` entries. Everything not named takes its
 *  default, which is what a real record written by the Setup form looks like. */
function configure(settings: Partial<EngineSettings> = {}): void {
  const stored: EngineSettings = { ...ENGINE_DEFAULTS, ...settings };
  vi.mocked(api.v1.storyStorage.get).mockImplementation(async (key: string) =>
    key === STORAGE_KEYS.ENGINE_SETTINGS ? stored : null,
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
    configure({ enabled: true });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.mocked(api.v1.storyStorage.get).mockReset();
    vi.mocked(api.v1.storyStorage.get).mockResolvedValue(null);
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
    configure({ enabled: true, delayMs: 1500 });
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
    // The pending flag is claimed before the settings read. Set on the far
    // side of that await, both of these would sail past the check and arm two
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

  it("forwards the user's generation to GenX, which lost this hook to us", async () => {
    // api.v1.hooks.register holds one callback per hook name, and GenX
    // registers this same hook in its constructor (initBudgetListener) to
    // unpark tasks waiting on budget. mount.ts builds GenX before
    // registerEffects, so our registration replaces it — forwarding is the
    // only thing keeping budget-parked generations from hanging forever.
    // Nothing in src/ reveals the collision; it lives in node_modules, which
    // the source guard below does not scan.
    vi.mocked(DEPS.genX.userInteraction).mockClear();
    registerEngineLoopEffects(DEPS);
    await registeredHook()(generation());
    expect(DEPS.genX.userInteraction).toHaveBeenCalledTimes(1);
  });

  it("does not forward a script-initiated generation to GenX", async () => {
    // Matching GenX's own filter: its budget listener only unparks on a real
    // user interaction, and the Engine's own calls are not one.
    vi.mocked(DEPS.genX.userInteraction).mockClear();
    registerEngineLoopEffects(DEPS);
    await registeredHook()(generation(true));
    expect(DEPS.genX.userInteraction).not.toHaveBeenCalled();
  });

  it("arms nothing when the Engine is disabled", async () => {
    configure({ enabled: false });
    registerEngineLoopEffects(DEPS);
    await registeredHook()(generation());
    expect(wakeups()).toEqual([]);
  });

  it("is off on a story that has never been configured", async () => {
    vi.mocked(api.v1.storyStorage.get).mockResolvedValue(null);
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
