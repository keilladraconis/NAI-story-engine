// Guards the composer's survival across a tab switch.
//
// The tab strip unmounts <Chat/> when you move to Story Engine, so unsent text
// has to live outside the component tree or it is lost — which cost users long
// setup messages they had not sent yet.
import { describe, it, expect, beforeEach } from "vitest";
import {
  readComposerDraft,
  writeComposerDraft,
  clearComposerDraft,
} from "../../src/ui/panels/chat/composer-draft";

const CHAT_A = "chat-a";
const CHAT_B = "chat-b";

describe("composer draft buffer", () => {
  beforeEach(() => {
    clearComposerDraft(CHAT_A);
    clearComposerDraft(CHAT_B);
  });

  it("reads back what was written — the unmount/remount round trip", () => {
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
