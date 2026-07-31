import { describe, it, expect } from "vitest";
import { buildRoot, HEADER_IDS } from "../../src/ui/header/header-parts";

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
