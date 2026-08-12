import { describe, it, expect, vi } from "vitest";
import type { Store } from "nai-store";
import type { GenX } from "nai-gen-x";
import { makeTestStore } from "../helpers/store-helpers";
import { registerGenerationEngineEffects } from "../../../../src/core/store/effects/generation-engine";
import {
  stateUpdated,
  requestQueued,
  requestActivated,
} from "../../../../src/core/store/slices/runtime";
import { uiRequestCancellation } from "../../../../src/core/store/slices/ui";
import type { RootState, AppDispatch } from "../../../../src/core/store/types";

// A GenX stub reproducing the behaviour that caused the bug.
//
// While parked in a budget wait, executeTask sits on
// `await api.v1.script.waitForAllowedOutput(n)` — a harness promise that takes
// no cancellation signal, so nothing can make it resolve early. cancelAll()
// therefore cancels the signal but deliberately does NOT report `idle`,
// because its `currentTask` is still non-null. The real GenX only reaches
// `idle` once the budget refills, which can be minutes away.
function makeParkedGenX() {
  const cancelAll = vi.fn();
  return { genX: { cancelAll } as unknown as GenX, cancelAll };
}

function makeHarness() {
  const store = makeTestStore();
  const { genX, cancelAll } = makeParkedGenX();

  registerGenerationEngineEffects(
    store.subscribeEffect as Store<RootState>["subscribeEffect"],
    store.dispatch as AppDispatch,
    store.getState as () => RootState,
    genX,
  );

  // Park the store where the bug bites: a bootstrap in flight, GenX reporting
  // waiting_for_budget (the state the header renders as "Wait (Ns)").
  store.dispatch(
    requestQueued({ id: "req-1", type: "bootstrap", targetId: "doc" }),
  );
  store.dispatch(requestActivated({ requestId: "req-1" }));
  store.dispatch(
    stateUpdated({
      genxState: {
        status: "waiting_for_budget",
        queueLength: 1,
        budgetWaitEndTime: 1_000_000,
      },
    }),
  );

  return { store, cancelAll };
}

describe("uiRequestCancellation during a budget wait", () => {
  it("still tells GenX to cancel", () => {
    const { store, cancelAll } = makeHarness();
    store.dispatch(uiRequestCancellation());
    expect(cancelAll).toHaveBeenCalledOnce();
  });

  it("returns the mirrored GenX status to idle immediately", () => {
    // Without this the header stays on "Wait (Ns)" until the budget refills,
    // so the click reads as doing nothing at all.
    const { store } = makeHarness();
    store.dispatch(uiRequestCancellation());
    expect(store.getState().runtime.genx.status).toBe("idle");
  });

  it("clears the cancelled request instead of leaving it marked in place", () => {
    // requestCancelled only stamps status:"cancelled" — it never clears
    // activeRequest. A cancelled bootstrap left sitting there keeps the
    // header's Bootstrap button disabled forever.
    const { store } = makeHarness();
    store.dispatch(uiRequestCancellation());
    expect(store.getState().runtime.activeRequest).toBeNull();
    expect(store.getState().runtime.queue).toEqual([]);
  });
});
