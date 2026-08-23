// The cap, and the two questions §4.5 asks of it: which thread gives way, and
// when does one the story quietly abandoned age out.
//
// Both are pure decisions over a `Thread` list, which is the whole reason they
// live outside the reducer that enforces them — the reducer is the place the
// invariant cannot be bypassed, not the place to reason about narrative weight.
import { describe, it, expect } from "vitest";
import {
  EXPIRY_WINDOWS,
  THREAD_EXPIRY_PARAGRAPHS,
  displacedByNextThread,
  displacementOrder,
  effectiveCap,
  enforceThreadCap,
  isThreadExpired,
} from "../../../src/core/engine/thread-cap";
import {
  PARAGRAPH_CHARS,
  THREAD_RANGE_CHARS,
} from "../../../src/core/engine/thread-horizon";
import type {
  Thread,
  ThreadHorizon,
  ThreadStatus,
} from "../../../src/core/store/types";

function thread(
  id: string,
  horizon: ThreadHorizon = "plot",
  status: ThreadStatus = "open",
): Thread {
  return {
    id,
    title: id,
    text: "",
    horizon,
    entityIds: [],
    status,
    anchorParagraph: null,
  };
}

/** Ids, in list order — every assertion below is about which threads survived
 *  and in what order, and reading that as ids keeps the cases legible. */
const ids = (threads: Thread[]): string[] => threads.map((t) => t.id);

describe("displacementOrder — weakest first", () => {
  it("gives up a satisfied thread before any open one", () => {
    // Even when the satisfied thread is the longest-lived kind and the open one
    // is the most disposable: a finished commitment costs a slot for nothing.
    const threads = [
      thread("point", "point"),
      thread("arc", "arc", "satisfied"),
    ];
    expect(ids(displacementOrder(threads))[0]).toBe("arc");
  });

  it("gives up the shortest horizon first among open threads", () => {
    const threads = [
      thread("a", "arc"),
      thread("b", "plot"),
      thread("c", "point"),
    ];
    expect(ids(displacementOrder(threads))).toEqual(["c", "b", "a"]);
  });

  it("breaks a tie by age, oldest first", () => {
    // Insertion order is the only age signal a Thread carries: `threadCreated`
    // appends and the persistence index round-trips the array in order.
    const threads = [thread("first"), thread("second"), thread("third")];
    expect(ids(displacementOrder(threads))).toEqual([
      "first",
      "second",
      "third",
    ]);
  });

  it("ranks satisfied threads among themselves by horizon then age", () => {
    const threads = [
      thread("old-plot", "plot", "satisfied"),
      thread("point", "point", "satisfied"),
      thread("new-plot", "plot", "satisfied"),
    ];
    expect(ids(displacementOrder(threads))).toEqual([
      "point",
      "old-plot",
      "new-plot",
    ]);
  });

  it("returns every thread exactly once", () => {
    const threads = [
      thread("a", "arc"),
      thread("b", "point", "satisfied"),
      thread("c", "plot"),
    ];
    expect(ids(displacementOrder(threads)).sort()).toEqual(["a", "b", "c"]);
  });

  it("does not reorder the caller's array", () => {
    const threads = [thread("a", "arc"), thread("b", "point")];
    displacementOrder(threads);
    expect(ids(threads)).toEqual(["a", "b"]);
  });

  it("has nothing to give up when there are no threads", () => {
    expect(displacementOrder([])).toEqual([]);
  });
});

describe("enforceThreadCap — room for the newest", () => {
  it("leaves a list under the cap alone, by identity", () => {
    // Identity, not equality: the reducer returns this straight into state and
    // a fresh array would repaint every subscriber for nothing.
    const threads = [thread("a"), thread("b")];
    expect(enforceThreadCap(threads, 8)).toBe(threads);
  });

  it("leaves a list exactly at the cap alone", () => {
    const threads = [thread("a"), thread("b"), thread("c")];
    expect(enforceThreadCap(threads, 3)).toBe(threads);
  });

  it("drops the weakest when the newest puts the list one over", () => {
    const threads = [
      thread("arc", "arc"),
      thread("point", "point"),
      thread("newest", "plot"),
    ];
    expect(ids(enforceThreadCap(threads, 2))).toEqual(["arc", "newest"]);
  });

  it("never displaces the newest, even when the newest is the weakest", () => {
    // The newest is the commitment the story just raised — the strongest
    // evidence of relevance a pure function has. A create that silently
    // undid itself would read as a broken button.
    const threads = [
      thread("arc", "arc"),
      thread("plot", "plot"),
      thread("newest", "point"),
    ];
    // The newcomer is the only point in the list and would be first out of
    // `displacementOrder`; the plot thread goes instead.
    expect(ids(enforceThreadCap(threads, 2))).toEqual(["arc", "newest"]);
  });

  it("counts a satisfied thread as occupying a slot, and spends it first", () => {
    // §4.5 calls the cap a cap on *open* threads; it is enforced over the whole
    // list so satisfied ones cannot accumulate beside it without bound. The
    // preference above is what makes the two readings agree in practice.
    const threads = [
      thread("done", "arc", "satisfied"),
      thread("open", "point"),
      thread("newest", "plot"),
    ];
    expect(ids(enforceThreadCap(threads, 2))).toEqual(["open", "newest"]);
  });

  it("brings a list left over an old, higher cap all the way down", () => {
    const threads = [
      thread("a", "arc"),
      thread("b", "plot"),
      thread("c", "point"),
      thread("d", "plot"),
      thread("newest", "point"),
    ];
    expect(ids(enforceThreadCap(threads, 2))).toEqual(["a", "newest"]);
  });

  it("keeps the survivors in their original order", () => {
    const threads = [
      thread("a", "arc"),
      thread("b", "point"),
      thread("c", "arc"),
      thread("newest", "plot"),
    ];
    expect(ids(enforceThreadCap(threads, 3))).toEqual(["a", "c", "newest"]);
  });

  it.each([
    ["zero", 0],
    ["negative", -5],
    ["NaN", Number.NaN],
  ])("treats a cap of %s as one, keeping the newest", (_label, cap) => {
    // The settings floor makes this unreachable through the form; the function
    // is total anyway, because a cap of zero would otherwise mean an empty
    // world every time somebody creates a thread.
    const threads = [thread("a"), thread("newest")];
    expect(ids(enforceThreadCap(threads, cap))).toEqual(["newest"]);
  });

  it("floors a fractional cap rather than rounding it up", () => {
    const threads = [thread("a"), thread("b"), thread("newest")];
    expect(ids(enforceThreadCap(threads, 2.9))).toEqual(["b", "newest"]);
  });

  it("has nothing to do with an empty list", () => {
    const threads: Thread[] = [];
    expect(enforceThreadCap(threads, 8)).toBe(threads);
  });
});

describe("effectiveCap — the cap as the reducer applies it", () => {
  it.each([
    [0, 1],
    [-5, 1],
    [Number.NaN, 1],
    [2.9, 2],
    [8, 8],
  ])("reads %s as %s", (given, expected) => {
    expect(effectiveCap(given)).toBe(expected);
  });
});

describe("displacedByNextThread — what the next OPEN costs", () => {
  it("costs nothing while there is room", () => {
    expect(displacedByNextThread([thread("a"), thread("b")], 8)).toEqual([]);
  });

  it("names the weakest thread once the list is exactly full", () => {
    const threads = [thread("arc", "arc"), thread("point", "point")];
    expect(ids(displacedByNextThread(threads, 2))).toEqual(["point"]);
  });

  it("prefers to spend a satisfied thread, whatever its horizon", () => {
    const threads = [
      thread("point", "point"),
      thread("done", "arc", "satisfied"),
    ];
    expect(ids(displacedByNextThread(threads, 2))).toEqual(["done"]);
  });

  it("names every thread a create would cost after the cap was lowered", () => {
    const threads = [
      thread("a", "arc"),
      thread("b", "plot"),
      thread("c", "point"),
      thread("d", "plot"),
    ];
    // 4 held, 2 allowed: the newcomer takes one slot and three must go.
    expect(ids(displacedByNextThread(threads, 2))).toEqual(["c", "b", "d"]);
  });

  it("agrees with the reducer, for every cap over the same list", () => {
    // The whole point of the nomination: what the manifest tells a model its
    // next OPEN would cost has to be what enforceThreadCap actually takes. Two
    // implementations of that would drift, so this asserts they are one.
    const threads = [
      thread("a", "arc"),
      thread("b", "point", "satisfied"),
      thread("c", "plot"),
      thread("d", "point"),
    ];
    const newcomer = thread("newest", "plot");
    for (const cap of [1, 2, 3, 4, 5, 8]) {
      const survivors = new Set(
        ids(enforceThreadCap([...threads, newcomer], cap)),
      );
      const dropped = ids(threads).filter((id) => !survivors.has(id));
      expect(ids(displacedByNextThread(threads, cap)).sort()).toEqual(
        dropped.sort(),
      );
    }
  });

  it("costs nothing on an empty list", () => {
    expect(displacedByNextThread([], 1)).toEqual([]);
  });
});

describe("isThreadExpired — an end the story walked away from", () => {
  it("derives each horizon's patience from its own forgetting window", () => {
    // The expiry is not a fourth set of magic numbers: it is ten of the
    // condition's own decay windows, so moving a range moves the expiry with
    // it and the two can never drift into disagreeing about what a horizon is.
    for (const horizon of ["point", "plot", "arc"] as const) {
      expect(THREAD_EXPIRY_PARAGRAPHS[horizon]).toBe(
        (EXPIRY_WINDOWS * THREAD_RANGE_CHARS[horizon]) / PARAGRAPH_CHARS,
      );
    }
  });

  it("spells out what those windows come to", () => {
    expect(THREAD_EXPIRY_PARAGRAPHS).toEqual({
      point: 25,
      plot: 100,
      arc: 300,
    });
  });

  it.each([
    ["point", 25],
    ["plot", 100],
    ["arc", 300],
  ] as const)(
    "expires an open %s thread on the paragraph it reaches its limit",
    (horizon, limit) => {
      expect(isThreadExpired(thread("t", horizon), limit - 1)).toBe(false);
      expect(isThreadExpired(thread("t", horizon), limit)).toBe(true);
    },
  );

  it("holds a longer horizon well past the point where a shorter one is gone", () => {
    expect(isThreadExpired(thread("p", "point"), 100)).toBe(true);
    expect(isThreadExpired(thread("a", "arc"), 100)).toBe(false);
  });

  it("never expires a satisfied thread", () => {
    // Satisfaction is not abandonment. A finished thread leaves by
    // displacement, which is what makes it the first slot the cap reclaims.
    expect(isThreadExpired(thread("t", "point", "satisfied"), 100_000)).toBe(
      false,
    );
  });

  it.each([
    ["a count that never advanced", 0],
    ["a count behind the anchor, as undo leaves it", -40],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
  ])("does not expire on %s", (_label, paragraphs) => {
    expect(isThreadExpired(thread("t", "point"), paragraphs)).toBe(false);
  });
});
