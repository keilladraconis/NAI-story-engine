import { describe, it, expect } from "vitest";
import {
  continuationTaskId,
  isRequestOrContinuation,
} from "../../../src/core/store/request-ids";

describe("continuation task ids", () => {
  it("recognises a request as its own", () => {
    expect(isRequestOrContinuation("req-1", "req-1")).toBe(true);
  });

  it("recognises the ids it mints as belonging to their parent", () => {
    for (let n = 1; n <= 3; n++) {
      expect(
        isRequestOrContinuation(continuationTaskId("req-1", n), "req-1"),
      ).toBe(true);
    }
  });

  it("does not claim a different request", () => {
    expect(isRequestOrContinuation("req-2", "req-1")).toBe(false);
    expect(
      isRequestOrContinuation(continuationTaskId("req-2", 1), "req-1"),
    ).toBe(false);
  });

  it("does not claim a request that merely starts with the same text", () => {
    // "req-10" must not be mistaken for a continuation of "req-1".
    expect(isRequestOrContinuation("req-10", "req-1")).toBe(false);
  });
});
