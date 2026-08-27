// Static guard over the Setup tab's "Talk it through" button.
//
// `.tsx` is never collected by vitest here, so the component cannot be
// render-tested; what can be held is its structure. The decision itself lives in
// `reusableBrainstormId` and is unit-tested in `chat-actions.test.ts` — this
// only pins that the button actually ASKS, because the bug was not a wrong
// answer, it was never asking: the CTA minted a chat unconditionally while the
// store's seeded, selected, empty "Brainstorm 1" sat unused beside it.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const CTA = join(__dirname, "../../src/ui/panels/setup/BrainstormCta.tsx");

/** Comments out: this file explains itself in prose and names the very calls the
 *  scans below look for. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

/** The click handler alone. Scanning the whole file would read the import list,
 *  where `chatCreated` is named long before the handler decides anything — an
 *  ordering check over the file would be measuring import order. */
function handler(): string {
  const src = code(readFileSync(CTA, "utf8"));
  const from = src.indexOf("const start =");
  expect(from).toBeGreaterThan(-1);
  const body = src.slice(from);
  const end = body.indexOf("\n  };");
  expect(end).toBeGreaterThan(-1);
  return body.slice(0, end);
}

describe("the brainstorm CTA", () => {
  it("asks whether the selected chat can be reused before creating one", () => {
    const src = handler();
    const asks = src.indexOf("reusableBrainstormId");
    const creates = src.indexOf("chatCreated");
    expect(asks).toBeGreaterThan(-1);
    expect(creates).toBeGreaterThan(-1);
    // Order matters, not just presence: a call whose answer is consulted after
    // the chat is already made would pass a presence-only check.
    expect(asks).toBeLessThan(creates);
  });

  it("returns without creating when a chat can be reused", () => {
    // The early return is the whole fix. Without it both branches run and the
    // reuse lookup is decoration.
    const src = handler();
    const guard = src.match(/if\s*\(\s*reusable\s*\)\s*\{[^}]*return;[^}]*\}/s);
    expect(guard).not.toBeNull();
  });

  it("still opens the chat tab on both paths", () => {
    // Reuse must not become a no-op button: the writer pressed it to get to a
    // conversation either way.
    const src = handler();
    const opens = src.match(/props\.onOpenChat\(\)/g) ?? [];
    expect(opens.length).toBeGreaterThanOrEqual(2);
  });
});
