import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { GenerationButton } from "../../../src/ui/components/GenerationButton";

describe("GenerationButton", () => {
  let dispatch: any;
  let useSelector: any;
  let stateCallback: (state: any) => any;
  let selectorCallback: (slice: any) => void;
  const api = (globalThis as any).api;

  beforeEach(() => {
    dispatch = vi.fn();
    useSelector = vi.fn((selector, cb) => {
      stateCallback = selector;
      selectorCallback = cb;
    });

    api.v1.ui.updateParts.mockClear();
    api.v1.timers.setTimeout.mockClear();
    api.v1.timers.clearTimeout.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const mountButton = (props: any = { id: "test-btn", label: "Test" }) => {
    GenerationButton.onMount(props, { dispatch, useSelector } as any);
  };

  const triggerState = (runtimeState: any) => {
    const fullState = {
      runtime: {
        activeRequest: null,
        queue: [],
        genx: {
          status: "idle",
          budgetState: "normal",
          budgetWaitEndTime: undefined,
        },
        ...runtimeState,
      },
    };

    const slice = stateCallback(fullState);
    selectorCallback(slice);
  };

  it("should render in idle state", () => {
    mountButton();
    triggerState({});

    expect(api.v1.ui.updateParts).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: "test-btn-gen", style: { display: "block" } }),
        expect.objectContaining({ id: "test-btn-wait", style: { display: "none" } }),
      ])
    );
  });

  it("should start timer in budget_timer state", async () => {
    vi.useFakeTimers();
    mountButton();

    const endTime = Date.now() + 5000;

    // Trigger timer state
    triggerState({
      genx: {
        status: "waiting_for_budget",
        budgetWaitEndTime: endTime,
      },
    });

    // Check initial update
    expect(api.v1.ui.updateParts).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: "test-btn-wait",
          style: { display: "block" },
        }),
      ])
    );

    // Verify updateTimer was called (it updates text)
    expect(api.v1.ui.updateParts).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: "test-btn-wait",
          text: expect.stringMatching(/Wait \(5s\)/),
        }),
      ])
    );

    // Check timer set
    expect(api.v1.timers.setTimeout).toHaveBeenCalled();

    // Advance time by 2s
    await vi.advanceTimersByTimeAsync(2000);

    // Verify third update
    // 1. updateTimer (initial)
    // 2. selector updates (initial)
    // 3. updateTimer (after 2s)
    expect(api.v1.ui.updateParts).toHaveBeenCalledTimes(3);

    const lastCall = api.v1.ui.updateParts.mock.calls.at(-1)[0];
    const waitBtn = lastCall.find((u: any) => u.id === "test-btn-wait");
    expect(waitBtn.text).toMatch(/Wait \(3s\)/);
  });
});
