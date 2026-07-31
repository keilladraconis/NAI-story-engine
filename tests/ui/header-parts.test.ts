import { describe, it, expect } from "vitest";
import {
  buildRoot,
  buildHeader,
  patch,
  widgetStyle,
  statusStyle,
  HEADER_IDS,
  type HeaderHandlers,
} from "../../src/ui/header/header-parts";
import type { HeaderModel } from "../../src/ui/header/header-model";

const HANDLERS: HeaderHandlers = {
  onWidget: () => {},
  onImport: () => {},
  onBootstrap: () => {},
};

const MODEL: HeaderModel = {
  widget: { mode: "budget", text: "4.2k out" },
  statusText: "",
  bootstrap: { text: "⚡ Opening Scene", disabled: false },
  importDisabled: false,
};

function findPart(tree: unknown, id: string): Record<string, any> | null {
  const node = tree as { id?: string; content?: unknown[] };
  if (node?.id === id) return node as Record<string, any>;
  for (const child of node?.content ?? []) {
    const hit = findPart(child, id);
    if (hit) return hit;
  }
  return null;
}

describe("buildRoot", () => {
  const header = { type: "text", id: "stub-header" } as unknown as UIPart;
  const body = { type: "jsx", id: "stub-body" } as unknown as UIPart;

  it("wraps header and body in a two-row grid", () => {
    const root = buildRoot(header, body) as unknown as {
      id: string;
      style: Record<string, string>;
      content: UIPart[];
    };
    expect(root.id).toBe(HEADER_IDS.root);
    expect(root.content).toEqual([header, body]);
  });

  it("lets the body row shrink below its content", () => {
    // minmax(0, 1fr) is the pixel-free equivalent of min-height:0. Without it
    // the jsx panel grows to fit the chat list and the composer scrolls away.
    const root = buildRoot(header, body) as unknown as {
      style: Record<string, string>;
    };
    expect(root.style.gridTemplateRows).toBe("auto minmax(0, 1fr)");
    expect(root.style.height).toBe("100%");
    expect(root.style.minHeight).toBe("0");
  });
});

describe("widgetStyle", () => {
  it("returns a complete style for every mode", () => {
    // updateParts replaces style wholesale, so a mode that omits a property
    // another mode sets would leave that property stuck from the last push.
    const modes = ["budget", "cancel", "continue", "wait"] as const;
    const keySets = modes.map((m) => Object.keys(widgetStyle(m)).sort());
    for (const keys of keySets) expect(keys).toEqual(keySets[0]);
  });

  it("never emits a literal colour", () => {
    for (const mode of ["budget", "cancel", "continue", "wait"] as const) {
      for (const value of Object.values(widgetStyle(mode))) {
        expect(value).not.toMatch(/^#[0-9a-f]{3,8}$/i);
      }
    }
  });
});

describe("statusStyle", () => {
  it("collapses the row when there is no status text", () => {
    expect(statusStyle("").display).toBe("none");
    expect(statusStyle("Characters 3/7").display).toBe("block");
  });
});

describe("buildHeader", () => {
  it("emits all four addressable parts with stable ids", () => {
    const header = buildHeader(MODEL, HANDLERS);
    for (const id of [
      HEADER_IDS.widget,
      HEADER_IDS.import,
      HEADER_IDS.bootstrap,
      HEADER_IDS.status,
    ]) {
      expect(findPart(header, id), id).not.toBeNull();
    }
  });

  it("never disables the widget — a disabled button clears no FlagB", () => {
    const busy: HeaderModel = {
      ...MODEL,
      widget: { mode: "cancel", text: "🚫 Cancel" },
    };
    expect(
      findPart(buildHeader(busy, HANDLERS), HEADER_IDS.widget)!.disabled,
    ).toBeUndefined();
  });

  it("marks the status text as non-templated", () => {
    // SEGA text can contain braces; {{...}} would be read as a storage key.
    const header = buildHeader(MODEL, HANDLERS);
    expect(findPart(header, HEADER_IDS.status)!.noTemplate).toBe(true);
  });
});

describe("patch", () => {
  it("pushes everything on the first call", () => {
    expect(patch(null, MODEL)).toHaveLength(4);
  });

  it("pushes nothing when the model is unchanged", () => {
    expect(patch(MODEL, { ...MODEL })).toEqual([]);
  });

  it("pushes only the widget when only the widget changed", () => {
    const next: HeaderModel = {
      ...MODEL,
      widget: { mode: "cancel", text: "🚫 Cancel" },
    };
    const parts = patch(MODEL, next) as Record<string, any>[];
    expect(parts).toHaveLength(1);
    expect(parts[0].id).toBe(HEADER_IDS.widget);
    expect(parts[0].text).toBe("🚫 Cancel");
  });

  it("carries the complete style object, not a delta", () => {
    const next: HeaderModel = {
      ...MODEL,
      widget: { mode: "cancel", text: "🚫 Cancel" },
    };
    const parts = patch(MODEL, next) as Record<string, any>[];
    expect(Object.keys(parts[0].style).sort()).toEqual(
      Object.keys(widgetStyle("cancel")).sort(),
    );
  });

  it("pushes the status row when its text changes", () => {
    const next: HeaderModel = { ...MODEL, statusText: "Characters 3/7" };
    const parts = patch(MODEL, next) as Record<string, any>[];
    expect(parts).toHaveLength(1);
    expect(parts[0].id).toBe(HEADER_IDS.status);
    expect(parts[0].style.display).toBe("block");
  });
});
