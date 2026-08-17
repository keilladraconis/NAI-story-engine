import { describe, it, expect } from "vitest";
import {
  isConcurrencyRefusal,
  backoffMs,
  MAX_ATTEMPTS,
} from "../../../src/core/engine/refusal";

/** The message the backend actually sends, quoted from design §12.0 where it was
 *  measured. If this string ever changes upstream, this is the line to update. */
const MEASURED = "A generation is already in progress";

describe("isConcurrencyRefusal", () => {
  it("recognises the backend's refusal message", () => {
    expect(isConcurrencyRefusal(new Error(MEASURED))).toBe(true);
  });

  it("matches case-insensitively and tolerates surrounding text", () => {
    expect(
      isConcurrencyRefusal(
        new Error("Request failed: a generation is already in progress."),
      ),
    ).toBe(true);
  });

  it("treats an unrecognised failure as non-retryable", () => {
    // Retrying an unknown failure is unlikely to help, and pretending to
    // understand it is how a loop spins on a permanent error.
    expect(isConcurrencyRefusal(new Error("400 Bad Request"))).toBe(false);
    expect(isConcurrencyRefusal("a string")).toBe(false);
    expect(isConcurrencyRefusal(null)).toBe(false);
    expect(isConcurrencyRefusal(undefined)).toBe(false);
  });

  it("recognises the refusal through an Error subclass", () => {
    // Nothing promises the rejection is a plain Error forever; a subclass that
    // still carries the measured message is still the same refusal.
    class BackendError extends Error {
      constructor(message: string) {
        super(message);
        this.name = "BackendError";
      }
    }
    expect(isConcurrencyRefusal(new BackendError(MEASURED))).toBe(true);
  });

  it("recognises a refusal that is not an Error instance", () => {
    // The probe in §12.0 read the rejection's OWN property names and printed
    // `message=... | name=Error` — `name` is inherited on a real Error, so the
    // value it caught was already carrying `name` as an own property. Rejections
    // also cross the host↔QuickJS boundary, where an `instanceof` check against
    // the sandbox's own Error constructor is not guaranteed to hold. Classifying
    // by shape rather than by prototype is what keeps a routine collision out of
    // the HUD's ⚠ if the reason arrives as a plain object.
    expect(isConcurrencyRefusal({ message: MEASURED, name: "Error" })).toBe(
      true,
    );
    expect(isConcurrencyRefusal({ message: MEASURED })).toBe(true);
  });

  it("stays conservative about everything that is not the refusal", () => {
    // Duck typing widens what can be READ, never what counts as retryable.
    expect(isConcurrencyRefusal({ message: "429 Too Many Requests" })).toBe(
      false,
    );
    expect(isConcurrencyRefusal({ name: "Error" })).toBe(false);
    expect(isConcurrencyRefusal({})).toBe(false);
    expect(isConcurrencyRefusal(0)).toBe(false);
    expect(isConcurrencyRefusal([MEASURED])).toBe(false);
  });

  it("survives an error with no usable message instead of throwing", () => {
    // `new Error()` leaves message as "". A rejection built by hand can leave it
    // undefined, or make it a non-string. None of those may crash the classifier
    // — it runs inside the effect's catch, where a throw would take out the pass
    // it was called to describe.
    expect(isConcurrencyRefusal(new Error())).toBe(false);
    expect(isConcurrencyRefusal({ message: undefined })).toBe(false);
    expect(isConcurrencyRefusal({ message: 42 })).toBe(false);
    expect(isConcurrencyRefusal({ message: null })).toBe(false);
  });
});

describe("backoffMs", () => {
  it("grows with each attempt", () => {
    const a = backoffMs(1);
    const b = backoffMs(2);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(b as number).toBeGreaterThan(a as number);
  });

  it("gives up at the bound rather than spinning", () => {
    // A long passage should hand the work back to the next wakeup rather than
    // let one firing spin against a lock that is still held.
    expect(backoffMs(MAX_ATTEMPTS)).toBeNull();
    expect(backoffMs(MAX_ATTEMPTS + 5)).toBeNull();
  });

  it("schedules exactly MAX_ATTEMPTS - 1 retries, strictly increasing", () => {
    // The contract Task 7 has to honour: `attempt` is the number of the RETRY
    // about to be made, counted from 1, so MAX_ATTEMPTS counts the original call
    // plus its retries. Walk it the way the effect will.
    const delays: number[] = [];
    for (let attempt = 1; attempt <= MAX_ATTEMPTS + 2; attempt++) {
      const delay = backoffMs(attempt);
      if (delay === null) break;
      delays.push(delay);
    }
    expect(delays.length).toBe(MAX_ATTEMPTS - 1);
    for (let i = 1; i < delays.length; i++) {
      expect(delays[i]).toBeGreaterThan(delays[i - 1]);
    }
  });

  it("returns delays a timer can actually take", () => {
    // These are handed to api.v1.timers. A fractional or non-finite delay is not
    // a schedule, it is undefined behaviour.
    for (let attempt = 1; attempt < MAX_ATTEMPTS; attempt++) {
      const delay = backoffMs(attempt);
      expect(delay).not.toBeNull();
      expect(Number.isInteger(delay as number)).toBe(true);
      expect(delay as number).toBeGreaterThan(0);
    }
  });

  it("gives up on an attempt number outside the contract", () => {
    // Retries are numbered from 1, so 0 and below are not retries at all. Giving
    // up is the safe answer for an out-of-contract number: a refusal is free
    // (§12.0) and the intent is requeued for the next wakeup, whereas clamping
    // would silently paper over a caller that counted from 0 — and NaN would
    // otherwise reach api.v1.timers as a delay.
    expect(backoffMs(0)).toBeNull();
    expect(backoffMs(-1)).toBeNull();
    expect(backoffMs(1.5)).toBeNull();
    expect(backoffMs(Number.NaN)).toBeNull();
    expect(backoffMs(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("bounds the total wait so one firing cannot sit on the loop", () => {
    // Every retry a single firing can make, added up. §3.4 wants a short growing
    // interval that hands back to the next wakeup, not a firing that parks for
    // the length of a passage.
    let total = 0;
    for (let attempt = 1; attempt < MAX_ATTEMPTS; attempt++) {
      total += backoffMs(attempt) ?? 0;
    }
    expect(total).toBeLessThanOrEqual(5000);
  });
});
