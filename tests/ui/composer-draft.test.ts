// Guards the composer's survival across a tab switch and a reload.
//
// The tab strip unmounts <Chat/> when you move to Story Engine, so unsent text
// has to live outside the component tree or it is lost — which cost users long
// setup messages they had not sent yet. The in-memory Map covers that; the
// storyStorage write-through covers a reload on top of it.
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  readComposerDraft,
  writeComposerDraft,
  clearComposerDraft,
  hydrateComposerDrafts,
} from "../../src/ui/panels/chat/composer-draft";
import { STORAGE_KEYS } from "../../src/core/keys";

const CHAT_A = "chat-a";
const CHAT_B = "chat-b";

const storage = () =>
  api.v1.storyStorage as unknown as {
    get: ReturnType<typeof vi.fn>;
    set: ReturnType<typeof vi.fn>;
  };

/** Last blob handed to storyStorage.set, or undefined if it was never called. */
function lastWrittenBlob(): Record<string, string> | undefined {
  const calls = storage().set.mock.calls;
  const composerCalls = calls.filter(
    (c) => c[0] === STORAGE_KEYS.COMPOSER_DRAFTS,
  );
  return composerCalls.at(-1)?.[1] as Record<string, string> | undefined;
}

describe("composer draft buffer", () => {
  beforeEach(() => {
    clearComposerDraft(CHAT_A);
    clearComposerDraft(CHAT_B);
    storage().get.mockReset().mockResolvedValue(null);
    storage().set.mockReset().mockResolvedValue(undefined);
  });

  describe("in-memory round trip (the tab switch)", () => {
    it("reads back what was written", () => {
      writeComposerDraft(CHAT_A, "a long setup message");
      expect(readComposerDraft(CHAT_A)).toBe("a long setup message");
    });

    it("returns empty string for a chat with no draft", () => {
      expect(readComposerDraft("never-typed-in")).toBe("");
    });

    it("keeps drafts separate per chat", () => {
      writeComposerDraft(CHAT_A, "for A");
      writeComposerDraft(CHAT_B, "for B");
      expect(readComposerDraft(CHAT_A)).toBe("for A");
      expect(readComposerDraft(CHAT_B)).toBe("for B");
    });

    it("overwrites on each keystroke rather than appending", () => {
      writeComposerDraft(CHAT_A, "Hel");
      writeComposerDraft(CHAT_A, "Hello");
      expect(readComposerDraft(CHAT_A)).toBe("Hello");
    });

    it("clearing one chat leaves the other intact", () => {
      writeComposerDraft(CHAT_A, "for A");
      writeComposerDraft(CHAT_B, "for B");
      clearComposerDraft(CHAT_A);
      expect(readComposerDraft(CHAT_A)).toBe("");
      expect(readComposerDraft(CHAT_B)).toBe("for B");
    });

    it("emptying the box drops the draft, so a sent chat reopens empty", () => {
      writeComposerDraft(CHAT_A, "typed then deleted");
      writeComposerDraft(CHAT_A, "");
      expect(readComposerDraft(CHAT_A)).toBe("");
    });
  });

  describe("persistence (the reload)", () => {
    it("a send persists the removal immediately, not on the debounce", () => {
      writeComposerDraft(CHAT_A, "about to be sent");
      storage().set.mockClear();
      clearComposerDraft(CHAT_A);
      // A stale draft reappearing after a reload is worse than losing typing,
      // so this write must not wait for the timer.
      expect(lastWrittenBlob()).toEqual({});
    });

    it("keystrokes reach storage once the debounce elapses, collapsed into one write", async () => {
      vi.useFakeTimers();
      try {
        writeComposerDraft(CHAT_A, "Hel");
        writeComposerDraft(CHAT_A, "Hello");
        expect(lastWrittenBlob()).toBeUndefined(); // still debouncing
        await vi.advanceTimersByTimeAsync(1000);
        expect(lastWrittenBlob()).toEqual({ [CHAT_A]: "Hello" });
        expect(
          storage().set.mock.calls.filter(
            (c) => c[0] === STORAGE_KEYS.COMPOSER_DRAFTS,
          ),
        ).toHaveLength(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it("clearing a chat with no draft does not write", () => {
      clearComposerDraft("never-typed-in");
      expect(lastWrittenBlob()).toBeUndefined();
    });

    it("hydrate restores a draft for a chat that still exists", async () => {
      storage().get.mockResolvedValue({ [CHAT_A]: "survived the reload" });
      await hydrateComposerDrafts([CHAT_A]);
      expect(readComposerDraft(CHAT_A)).toBe("survived the reload");
    });

    it("hydrate drops drafts whose chat is gone, and rewrites the blob", async () => {
      storage().get.mockResolvedValue({
        [CHAT_A]: "keep me",
        "deleted-chat": "orphan",
      });
      await hydrateComposerDrafts([CHAT_A]);
      expect(readComposerDraft(CHAT_A)).toBe("keep me");
      expect(readComposerDraft("deleted-chat")).toBe("");
      // Pruning must be written back or the blob grows without bound.
      expect(lastWrittenBlob()).toEqual({ [CHAT_A]: "keep me" });
    });

    it("hydrate tolerates a missing or malformed blob", async () => {
      storage().get.mockResolvedValue(null);
      await expect(hydrateComposerDrafts([CHAT_A])).resolves.toBeUndefined();

      storage().get.mockResolvedValue({ [CHAT_A]: 42 });
      await hydrateComposerDrafts([CHAT_A]);
      expect(readComposerDraft(CHAT_A)).toBe("");
    });
  });
});
