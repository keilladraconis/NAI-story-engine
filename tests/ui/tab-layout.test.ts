import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// Bootstrap and Import moved out of the header into Setup. These guards keep
// them there: a future edit that reintroduces either control to the header
// would silently give the writer two of each.
const UI_DIR = join(__dirname, "../../src/ui");

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return tsxFiles(full);
    return full.endsWith(".tsx") ? [full] : [];
  });
}

function read(relative: string): string {
  return readFileSync(join(UI_DIR, relative), "utf8");
}

describe("bootstrap and import live in Setup", () => {
  it("the header dispatches neither bootstrap nor the import wizard", () => {
    const src = read("header/Header.tsx");
    expect(src).not.toContain("bootstrapRequested");
    expect(src).not.toContain("bootstrapContinueRequested");
    expect(src).not.toContain("importWizardOpened");
  });

  it("exactly one component renders the Import wizard", () => {
    const renderers = tsxFiles(UI_DIR).filter((file) =>
      readFileSync(file, "utf8").includes("<ImportWizard"),
    );
    expect(renderers.map((f) => f.split("/").pop())).toEqual(["Setup.tsx"]);
  });

  it("exactly one component renders the Foundation list", () => {
    const renderers = tsxFiles(UI_DIR).filter((file) =>
      readFileSync(file, "utf8").includes("<Foundation "),
    );
    expect(renderers.map((f) => f.split("/").pop())).toEqual(["Setup.tsx"]);
  });
});

describe("header-model holds only the generation state machine", () => {
  it("no longer derives bootstrap or import", () => {
    const src = readFileSync(join(UI_DIR, "header/header-model.ts"), "utf8");
    expect(src).not.toContain("importDisabled");
    expect(src).not.toContain("hasDocumentContent");
  });
});
