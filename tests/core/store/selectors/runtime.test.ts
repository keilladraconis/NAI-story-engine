import { describe, it, expect } from "vitest";
import {
  isFoundationRequestPending,
  isRequestActive,
} from "../../../../src/core/store/selectors/runtime";
import { initialRuntimeState } from "../../../../src/core/store/slices/runtime";
import type {
  RootState,
  RuntimeState,
  GenerationRequest,
} from "../../../../src/core/store/types";

const request = (over: Partial<GenerationRequest> = {}): GenerationRequest => ({
  id: "r1",
  type: "foundation",
  targetId: "shape",
  status: "queued",
  ...over,
});

const stateWith = (runtime: Partial<RuntimeState>): RootState =>
  ({ runtime: { ...initialRuntimeState, ...runtime } }) as RootState;

describe("isFoundationRequestPending", () => {
  it("is false with an empty queue and nothing active", () => {
    expect(isFoundationRequestPending(stateWith({}), "shape")).toBe(false);
  });

  it("is true while a request for the field is queued", () => {
    const s = stateWith({ queue: [request()] });
    expect(isFoundationRequestPending(s, "shape")).toBe(true);
  });

  it("is true while a request for the field is generating", () => {
    const s = stateWith({
      activeRequest: request({ status: "processing" }),
    });
    expect(isFoundationRequestPending(s, "shape")).toBe(true);
  });

  // Import All submits Shape and Intent together; neither may mask the other.
  it("does not confuse one foundation field with another", () => {
    const s = stateWith({ queue: [request()] });
    expect(isFoundationRequestPending(s, "intent")).toBe(false);
  });

  it("ignores requests of other types with the same target id", () => {
    const s = stateWith({
      queue: [request({ type: "entitySummary" })],
    });
    expect(isFoundationRequestPending(s, "shape")).toBe(false);
  });
});

describe("isRequestActive", () => {
  it("is false when the id is nowhere", () => {
    expect(isRequestActive(stateWith({}).runtime, "req-1")).toBe(false);
  });

  it("sees a queued id", () => {
    const s = stateWith({ queue: [request({ id: "req-1" })] });
    expect(isRequestActive(s.runtime, "req-1")).toBe(true);
  });

  it("sees the generating id", () => {
    const s = stateWith({
      activeRequest: request({ id: "req-1", status: "processing" }),
    });
    expect(isRequestActive(s.runtime, "req-1")).toBe(true);
  });

  // SEGA drives its own requests through the same ids, so a manual regen must
  // not queue work S.E.G.A. already has in hand.
  it("sees an id S.E.G.A. is running", () => {
    const s = stateWith({
      sega: { ...initialRuntimeState.sega, activeRequestIds: ["req-1"] },
    });
    expect(isRequestActive(s.runtime, "req-1")).toBe(true);
  });
});
