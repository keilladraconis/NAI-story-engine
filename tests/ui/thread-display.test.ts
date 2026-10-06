import { describe, it, expect } from "vitest";
import {
  nextStatus,
  statusOption,
  STATUS_OPTIONS,
  threadAddModel,
} from "../../src/ui/panels/world/thread-display";

describe("a Thread's status, in words", () => {
  it("has exactly two readings", () => {
    expect(STATUS_OPTIONS.map((o) => o.id)).toEqual(["open", "concluded"]);
  });

  it("says what pressing the control does from each", () => {
    expect(statusOption("open").action).toBe("Conclude");
    expect(statusOption("concluded").action).toBe("Reopen");
  });

  it("moves between the two by explicit value", () => {
    expect(nextStatus("open")).toBe("concluded");
    expect(nextStatus("concluded")).toBe("open");
  });
});

describe("the add-thread control", () => {
  it("shows open Threads against the Engine's limit", () => {
    expect(threadAddModel(3, 8).count).toBe("3/8");
  });

  it("says the limit binds the Engine, not the writer", () => {
    expect(threadAddModel(8, 8).title).toContain("the Engine admits no more");
    expect(threadAddModel(3, 8).title).toBe("Add thread (3/8)");
  });
});
