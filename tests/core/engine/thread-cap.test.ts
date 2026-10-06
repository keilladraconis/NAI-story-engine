import { describe, it, expect } from "vitest";
import {
  atThreadCap,
  effectiveCap,
  openThreadCount,
} from "../../../src/core/engine/thread-cap";

const open = { status: "open" as const };
const concluded = { status: "concluded" as const };

describe("the thread limit counts open Threads", () => {
  it("ignores concluded Threads", () => {
    expect(openThreadCount([open, concluded, open])).toBe(2);
  });

  it("is reached at the limit, not past it", () => {
    expect(atThreadCap([open, open], 2)).toBe(true);
    expect(atThreadCap([open, concluded], 2)).toBe(false);
  });

  it("never reads a limit below one", () => {
    expect(effectiveCap(0)).toBe(1);
    expect(effectiveCap(8.9)).toBe(8);
    expect(effectiveCap(Number.NaN)).toBe(1);
  });
});
