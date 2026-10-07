import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { PAGE_SIZE, pageWindow } from "../../src/ui/panels/chat/paging";

describe("the chat's message window", () => {
  it("shows everything when the chat fits on a page", () => {
    expect(pageWindow(10, 0)).toEqual({
      start: 0,
      end: 10,
      back: 0,
      hasOlder: false,
      hasNewer: false,
    });
  });

  it("shows the newest page by default", () => {
    expect(pageWindow(60, 0)).toMatchObject({
      start: 35,
      end: 60,
      hasOlder: true,
      hasNewer: false,
    });
  });

  it("pages back one page at a time, and the oldest page may be short", () => {
    expect(pageWindow(60, 1)).toMatchObject({
      start: 10,
      end: 35,
      hasOlder: true,
      hasNewer: true,
    });
    expect(pageWindow(60, 2)).toMatchObject({
      start: 0,
      end: 10,
      hasOlder: false,
      hasNewer: true,
    });
  });

  it("clamps a position the chat no longer reaches", () => {
    // Paged three back, then a retry pruned the chat to 30 messages.
    expect(pageWindow(30, 3)).toMatchObject({ start: 0, end: 5, back: 1 });
    expect(pageWindow(5, 3)).toMatchObject({ start: 0, end: 5, back: 0 });
    expect(pageWindow(0, 2)).toMatchObject({ start: 0, end: 0, back: 0 });
  });

  it("never shows nothing for a chat that has messages", () => {
    for (let total = 1; total <= 80; total++) {
      for (let back = 0; back <= 5; back++) {
        const w = pageWindow(total, back);
        expect(w.end - w.start).toBeGreaterThan(0);
        expect(w.end - w.start).toBeLessThanOrEqual(PAGE_SIZE);
      }
    }
  });
});

describe("Chat.tsx and the window", () => {
  const source = readFileSync("src/ui/panels/chat/Chat.tsx", "utf8");

  it("returns to the newest page when a message is sent", () => {
    expect(source).toMatch(/matchesAction\(uiChatSubmitUserMessage\)/);
  });

  it("keeps the window out of the store", () => {
    expect(source).not.toMatch(/dispatch\([^)]*[Pp]age/);
  });

  it("mounts both load-more buttons and lets display pick", () => {
    expect(source).not.toMatch(/hasOlder\s*&&|hasNewer\s*&&/);
    expect(source.match(/display:\s*w\.has(Older|Newer)/g)).toHaveLength(2);
  });
});
