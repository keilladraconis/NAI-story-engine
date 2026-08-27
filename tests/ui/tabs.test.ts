import { describe, it, expect } from "vitest";
import {
  TAB_ORDER,
  TAB_LABELS,
  initialTab,
  isFoundationField,
  tabForActiveEdit,
} from "../../src/ui/tabs";

describe("tab order", () => {
  it("puts Setup leftmost", () => {
    expect(TAB_ORDER[0]).toBe("setup");
  });

  it("lists every tab exactly once", () => {
    expect([...TAB_ORDER].sort()).toEqual(["chat", "engine", "setup"]);
  });

  it("labels every tab", () => {
    for (const tab of TAB_ORDER) {
      expect(TAB_LABELS[tab]).toBeTruthy();
    }
  });
});

describe("initialTab", () => {
  it("opens on Setup for an empty document", () => {
    expect(initialTab(false)).toBe("setup");
  });

  it("opens on Engine once the story has prose", () => {
    expect(initialTab(true)).toBe("engine");
  });
});

describe("isFoundationField", () => {
  it("recognises every Foundation field id", () => {
    for (const id of ["shape", "intent", "contract", "attg", "style"]) {
      expect(isFoundationField(id)).toBe(true);
    }
  });

  it("rejects entity ids and null", () => {
    expect(isFoundationField("3f2b1c9e-uuid-shaped")).toBe(false);
    expect(isFoundationField(null)).toBe(false);
  });
});

describe("tabForActiveEdit", () => {
  it("returns to Setup when a Foundation field pane is open", () => {
    expect(tabForActiveEdit("style")).toBe("setup");
  });

  it("returns to Engine for an entity, a thread, or nothing", () => {
    expect(tabForActiveEdit("3f2b1c9e-uuid-shaped")).toBe("engine");
    expect(tabForActiveEdit(null)).toBe("engine");
  });
});
