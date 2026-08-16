import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The generate/refine button owns both glyphs. Two invariants matter and
// neither is reachable headlessly (no DOM in the test env, and the JSX runtime
// is a NAI global), so they are checked against the source.
//
// 1. Both icons stay mounted and toggle via `display`. A conditional
//    component-type swap at one position leaves the old svg behind when the
//    re-render comes from a detached callback, and the button shows a bolt AND
//    a quill (same failure ConfirmButton and the header's WidgetIcon work
//    around).
// 2. Every button that can open a refine goes through this component, so a
//    refine-capable control cannot go back to rendering a bare ⚡.
describe("GenerateButton", () => {
  const UI_DIR = join(__dirname, "../../src/ui");
  const src = readFileSync(
    join(UI_DIR, "components/GenerateButton.tsx"),
    "utf8",
  );

  it("mounts both glyphs and toggles them with display", () => {
    expect(src).toContain("<Zap");
    expect(src).toContain("<Feather");
    expect(src).toMatch(/display: refine \? "none" : "inline"/);
    expect(src).toMatch(/display: refine \? "inline" : "none"/);
  });

  it("does not swap the icon component type at one position", () => {
    expect(src).not.toMatch(/\?\s*<(Zap|Feather)/);
  });

  it("names the refine mode 'Refine' in the tooltip", () => {
    expect(src).toContain('refine ? "Refine"');
  });

  for (const callsite of [
    "panels/foundation/FieldCard.tsx",
    "panels/world/EntityEditPane.tsx",
  ]) {
    it(`${callsite} routes its generate/refine button through GenerateButton`, () => {
      const file = readFileSync(join(UI_DIR, callsite), "utf8");
      expect(file).toContain("<GenerateButton");
      // A bare <Zap/> here would be a control that never shows the quill.
      expect(file).not.toContain("<Zap");
    });
  }
});
