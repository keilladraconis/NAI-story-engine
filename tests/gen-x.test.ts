import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { GenX } from "../lib/gen-x";

describe("GenX", () => {
  let genX: GenX;

  beforeEach(() => {
    vi.clearAllMocks();
    genX = new GenX();
    // Default generate mock to return success immediately
    (globalThis as any).api.v1.generate.mockImplementation(
      async (_msgs: any, _params: any, cb: any) => {
        // Mock streaming callback with correct signature: (choices[], final)
        if (cb) cb([{ text: "generated", index: 0, token_ids: [] }], false);
        return {
          choices: [{ text: "generated text", index: 0, token_ids: [] }],
        };
      },
    );
    // Default budget mock: plenty available
    (globalThis as any).api.v1.script.getAllowedOutput.mockReturnValue(9999);
    (globalThis as any).api.v1.script.getTimeUntilAllowedOutput.mockReturnValue(0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should execute a task successfully", async () => {
    const result = await genX.generate([], { model: "test" });
    expect(result.choices[0].text).toBe("generated text");
    expect((globalThis as any).api.v1.generate).toHaveBeenCalledTimes(1);

    // Allow queue processing to finish and set state to idle
    await new Promise((r) => globalThis.setTimeout(r, 0));
    expect(genX.state.status).toBe("idle");
  });

  it("should execute tasks sequentially", async () => {
    // Mock generate to take some time
    (globalThis as any).api.v1.generate.mockImplementation(async () => {
      await new Promise((r) => globalThis.setTimeout(r, 10));
      return { choices: [{ text: "result" }] };
    });

    const p1 = genX.generate([], { model: "test" });
    const p2 = genX.generate([], { model: "test" });

    expect(genX.state.queueLength).toBeGreaterThan(0);

    await Promise.all([p1, p2]);

    expect((globalThis as any).api.v1.generate).toHaveBeenCalledTimes(2);
  });

  it("should retry on transient error", async () => {
    let callCount = 0;
    (globalThis as any).api.v1.generate.mockImplementation(async () => {
      callCount++;
      if (callCount === 1) throw new Error("Fetch failed");
      return { choices: [{ text: "success" }] };
    });

    const result = await genX.generate([], { model: "test", maxRetries: 3 });
    expect(result.choices[0].text).toBe("success");
    expect(callCount).toBe(2);
  });

  it("should fail on non-transient error", async () => {
    (globalThis as any).api.v1.generate.mockImplementation(async () => {
      throw new Error("Context too long"); // Not in transient list
    });

    await expect(genX.generate([], { model: "test" })).rejects.toThrow("Context too long");
  });

  it("should handle budget wait (user)", async () => {
    // Capture the hook listener
    let hookCallback: any;
    // We expect api.v1.hooks.register to be called
    (globalThis as any).api.v1.hooks.register.mockImplementation(
      (name: string, cb: any) => {
        if (name === "onGenerationRequested") hookCallback = cb;
      },
    );

    // Re-instantiate GenX to hook up the listener
    genX = new GenX();

    // Mock low budget
    (globalThis as any).api.v1.script.getAllowedOutput.mockReturnValue(0);
    (globalThis as any).api.v1.script.getTimeUntilAllowedOutput.mockReturnValue(
      100,
    );

    const promise = genX.generate([], { model: "test", max_tokens: 50 });

    // Wait for state update
    await new Promise((r) => globalThis.setTimeout(r, 0));
    expect(genX.state.status).toBe("waiting_for_user");

    // Trigger user action
    if (hookCallback) {
      // Update budget to allow pass
      (globalThis as any).api.v1.script.getAllowedOutput.mockReturnValue(1000);
      (globalThis as any).api.v1.script.getTimeUntilAllowedOutput.mockReturnValue(
        0,
      );

      hookCallback({ scriptInitiated: false });
    }

    const result = await promise;
    expect(result.choices[0].text).toBe("generated text");
    expect(genX.state.status).toBe("completed"); // or idle eventually
  });

  it("should handle cancellation during generation", async () => {
    // Polling based cancellation doesn't need mock listeners
    const signal = {
      cancelled: false,
      cancel: async () => {
        signal.cancelled = true;
      },
      dispose: () => {},
    };

    (globalThis as any).api.v1.generate.mockImplementation(
      async (_msgs: any, _params: any, _cb: any, _behavior: any, sig: any) => {
        // Wait long enough for polling to catch it
        // Polling interval is around 200ms or 1000ms
        // But we want to test cancellation BEFORE generation? Or during?
        // If during generation, api.v1.generate handles it (mock should throw)

        // This test simulates GenX handling cancellation IF api.v1.generate doesn't catch it immediately?
        // Or rather, checking if GenX passes the signal and handles rejection.

        let checks = 0;
        while (checks < 10) {
          await new Promise((r) => globalThis.setTimeout(r, 50));
          if (sig?.cancelled) throw new Error("Cancelled");
          checks++;
        }
        return { choices: [{ text: "success" }] };
      },
    );

    const promise = genX.generate([], { model: "test" }, undefined, "background", signal);

    // Cancel immediately
    globalThis.setTimeout(() => {
      signal.cancel();
    }, 10);

    await expect(promise).rejects.toMatch(/Cancelled/);
  });
});
