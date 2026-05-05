# Typed Chat System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded Brainstorm slice/effects/UI with a typed chat-session system, restoring per-field Refine via a registry-driven `ChatTypeSpec` contract that supports `brainstorm`, `summary`, and `refine` chat types, with the architecture set up for future types.

**Architecture:** A registry of `ChatTypeSpec` modules under `src/core/chat-types/` defines per-type system prompts, prefill, lifecycle, sub-modes, and `contextSlice` projection. State centralizes in `src/core/store/slices/chat.ts` (`chats[]` for saved + a single `refineChat` slot). All chat behavior dispatches through one `chat-effects.ts` that resolves specs at runtime. Field-generate strategies grow one optional `refineContext` knob; `refine-strategy.ts` decorates the tail.

**Tech Stack:** TypeScript (strict), `nai-store` (Redux-like), `nai-simple-ui` (SUI components), Vitest, NovelAI script API (`api.v1`).

**Spec:** `docs/superpowers/specs/2026-05-05-typed-chat-system-design.md`.

---

## Conventions

- All new files are TypeScript (`.ts`).
- Tests live in `tests/` mirroring `src/` structure (e.g. `src/core/chat-types/brainstorm.ts` → `tests/core/chat-types/brainstorm.test.ts`).
- Run a single test file with `npm run test -- tests/path/file.test.ts`. Run the whole suite with `npm run test`.
- Commit after **each** task. The repo already lives on branch `v12`; do not create new branches.
- When a task says "Run tests, expect PASS," run the new file you just authored, not the whole suite, unless the task says otherwise.
- Code samples in this plan are the actual content to paste in. They are not pseudocode.

---

## Phase 1 — Types, slice, migration

### Task 1: Define chat-type interfaces

**Files:**
- Create: `src/core/chat-types/types.ts`
- Test: none yet (interface-only file)

- [ ] **Step 1: Create the types module**

```ts
// src/core/chat-types/types.ts
import type { Action } from "nai-store";
import type { RootState, AppDispatch } from "../store/types";

export type ChatLifecycle = "save" | "commit-discard";

export type ChatMessageRole = "system" | "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: ChatMessageRole;
  content: string;
  /** Marks an assistant message as a candidate rewrite inside a refine chat. */
  refineCandidate?: boolean;
}

export type ChatSeed =
  | { kind: "blank" }
  | { kind: "fromChat"; sourceChatId: string }
  | { kind: "fromStoryText"; sourceText: string }
  | { kind: "fromField"; sourceFieldId: string; sourceText: string };

export interface RefineTarget {
  fieldId: string;
  originalText: string;
}

export interface Chat {
  id: string;
  type: string;
  title: string;
  subMode?: string;
  messages: ChatMessage[];
  seed: ChatSeed;
  refineTarget?: RefineTarget;
}

export interface RefineContext {
  fieldId: string;
  currentText: string;
  history: ChatMessage[];
}

export interface HeaderControl {
  id: string;
  /** Tag identifying which header control this is, so ChatHeader knows how to render. */
  kind: "subModeToggle" | "summarizeButton" | "sessionsButton" | "label";
  payload?: Record<string, unknown>;
}

export interface SpecCtx {
  getState: () => RootState;
  dispatch: AppDispatch;
}

export interface InitializeResult {
  title: string;
  initialMessages: ChatMessage[];
  subMode?: string;
}

export interface ChatTypeSpec<SubMode extends string = string> {
  id: string;
  displayName: string;
  lifecycle: ChatLifecycle;
  subModes?: readonly SubMode[];
  defaultSubMode?: SubMode;

  initialize(seed: ChatSeed, ctx: SpecCtx): InitializeResult;
  systemPromptFor(chat: Chat, ctx: SpecCtx): string;
  prefillFor?(chat: Chat, ctx: SpecCtx): string | undefined;
  contextSlice(chat: Chat, ctx: SpecCtx): ChatMessage[];
  headerControls(chat: Chat, ctx: SpecCtx): HeaderControl[];

  onCommit?(chat: Chat, ctx: SpecCtx): void;
  onDiscard?(chat: Chat, ctx: SpecCtx): void;
}

export type AnyChatTypeSpec = ChatTypeSpec<string>;
```

- [ ] **Step 2: Verify the file type-checks**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "chat-types/types"`
Expected: empty output (no errors involving the new file).

- [ ] **Step 3: Commit**

```bash
git add src/core/chat-types/types.ts
git commit -m "feat: define ChatTypeSpec, Chat, ChatMessage, RefineContext interfaces"
```

---

### Task 2: Add chat slice (TDD: reducers first)

**Files:**
- Create: `src/core/store/slices/chat.ts`
- Test: `tests/core/store/slices/chat.test.ts`

- [ ] **Step 1: Write failing tests for the slice**

```ts
// tests/core/store/slices/chat.test.ts
import { describe, it, expect } from "vitest";
import {
  chatSliceReducer,
  initialChatState,
  chatCreated,
  chatRenamed,
  chatSwitched,
  chatDeleted,
  subModeChanged,
  messageAdded,
  messageUpdated,
  messageAppended,
  messageRemoved,
  messagesPrunedAfter,
  refineChatOpened,
  refineCandidateMarked,
  refineChatCleared,
} from "../../../../src/core/store/slices/chat";
import type { Chat } from "../../../../src/core/chat-types/types";

const blankChat = (over: Partial<Chat> = {}): Chat => ({
  id: "c1",
  type: "brainstorm",
  title: "Test",
  subMode: "cowriter",
  messages: [],
  seed: { kind: "blank" },
  ...over,
});

describe("chat slice", () => {
  it("starts with one default brainstorm chat", () => {
    expect(initialChatState.chats.length).toBe(1);
    expect(initialChatState.chats[0].type).toBe("brainstorm");
    expect(initialChatState.activeChatId).toBe(initialChatState.chats[0].id);
    expect(initialChatState.refineChat).toBeNull();
  });

  it("chatCreated appends and switches to the new chat", () => {
    const start = { ...initialChatState };
    const next = chatSliceReducer(start, chatCreated({ chat: blankChat({ id: "c2" }) }));
    expect(next.chats.length).toBe(2);
    expect(next.activeChatId).toBe("c2");
  });

  it("chatRenamed updates only the matching chat", () => {
    const start = {
      chats: [blankChat({ id: "a" }), blankChat({ id: "b", title: "B" })],
      activeChatId: "a",
      refineChat: null,
    };
    const next = chatSliceReducer(start, chatRenamed({ id: "b", title: "renamed" }));
    expect(next.chats[0].title).toBe("Test");
    expect(next.chats[1].title).toBe("renamed");
  });

  it("chatSwitched updates activeChatId only when the id exists", () => {
    const start = {
      chats: [blankChat({ id: "a" })],
      activeChatId: "a",
      refineChat: null,
    };
    expect(chatSliceReducer(start, chatSwitched({ id: "missing" })).activeChatId).toBe("a");
    expect(
      chatSliceReducer(
        { ...start, chats: [...start.chats, blankChat({ id: "b" })] },
        chatSwitched({ id: "b" }),
      ).activeChatId,
    ).toBe("b");
  });

  it("chatDeleted refuses to remove the last chat", () => {
    const start = {
      chats: [blankChat({ id: "a" })],
      activeChatId: "a",
      refineChat: null,
    };
    const next = chatSliceReducer(start, chatDeleted({ id: "a" }));
    expect(next.chats.length).toBe(1);
  });

  it("subModeChanged mutates only the matching chat", () => {
    const start = {
      chats: [blankChat({ id: "a", subMode: "cowriter" })],
      activeChatId: "a",
      refineChat: null,
    };
    const next = chatSliceReducer(start, subModeChanged({ id: "a", subMode: "critic" }));
    expect(next.chats[0].subMode).toBe("critic");
  });

  it("messageAdded appends to the matching chat", () => {
    const start = {
      chats: [blankChat({ id: "a" })],
      activeChatId: "a",
      refineChat: null,
    };
    const next = chatSliceReducer(
      start,
      messageAdded({ chatId: "a", message: { id: "m1", role: "user", content: "hi" } }),
    );
    expect(next.chats[0].messages).toHaveLength(1);
    expect(next.chats[0].messages[0].content).toBe("hi");
  });

  it("messageAppended concatenates content for streaming", () => {
    const start = {
      chats: [blankChat({ id: "a", messages: [{ id: "m1", role: "assistant", content: "Hel" }] })],
      activeChatId: "a",
      refineChat: null,
    };
    const next = chatSliceReducer(start, messageAppended({ chatId: "a", id: "m1", content: "lo" }));
    expect(next.chats[0].messages[0].content).toBe("Hello");
  });

  it("messageUpdated overwrites content", () => {
    const start = {
      chats: [blankChat({ id: "a", messages: [{ id: "m1", role: "assistant", content: "wrong" }] })],
      activeChatId: "a",
      refineChat: null,
    };
    const next = chatSliceReducer(
      start,
      messageUpdated({ chatId: "a", id: "m1", content: "right" }),
    );
    expect(next.chats[0].messages[0].content).toBe("right");
  });

  it("messageRemoved drops the matching message", () => {
    const start = {
      chats: [
        blankChat({
          id: "a",
          messages: [
            { id: "m1", role: "user", content: "x" },
            { id: "m2", role: "assistant", content: "y" },
          ],
        }),
      ],
      activeChatId: "a",
      refineChat: null,
    };
    const next = chatSliceReducer(start, messageRemoved({ chatId: "a", id: "m1" }));
    expect(next.chats[0].messages).toHaveLength(1);
    expect(next.chats[0].messages[0].id).toBe("m2");
  });

  it("messagesPrunedAfter trims after the user message inclusive of it", () => {
    const start = {
      chats: [
        blankChat({
          id: "a",
          messages: [
            { id: "m1", role: "user", content: "u1" },
            { id: "m2", role: "assistant", content: "a1" },
            { id: "m3", role: "user", content: "u2" },
            { id: "m4", role: "assistant", content: "a2" },
          ],
        }),
      ],
      activeChatId: "a",
      refineChat: null,
    };
    const next = chatSliceReducer(start, messagesPrunedAfter({ chatId: "a", id: "m3" }));
    expect(next.chats[0].messages.map((m) => m.id)).toEqual(["m1", "m2", "m3"]);
  });

  it("refineChatOpened populates the slot when null", () => {
    const start = { ...initialChatState };
    const refine: Chat = {
      id: "r1",
      type: "refine",
      title: "Refining: Intent",
      messages: [],
      seed: { kind: "fromField", sourceFieldId: "intent", sourceText: "..." },
      refineTarget: { fieldId: "intent", originalText: "..." },
    };
    const next = chatSliceReducer(start, refineChatOpened({ chat: refine }));
    expect(next.refineChat?.id).toBe("r1");
  });

  it("refineChatOpened ignores when slot already set (collision)", () => {
    const open: Chat = {
      id: "r1",
      type: "refine",
      title: "x",
      messages: [],
      seed: { kind: "blank" },
    };
    const start = { ...initialChatState, refineChat: open };
    const next = chatSliceReducer(
      start,
      refineChatOpened({
        chat: { ...open, id: "r2" },
      }),
    );
    expect(next.refineChat?.id).toBe("r1");
  });

  it("refineChatCleared nulls the slot", () => {
    const open: Chat = {
      id: "r1",
      type: "refine",
      title: "x",
      messages: [],
      seed: { kind: "blank" },
    };
    const start = { ...initialChatState, refineChat: open };
    const next = chatSliceReducer(start, refineChatCleared());
    expect(next.refineChat).toBeNull();
  });

  it("refineCandidateMarked flips the flag on a refine message", () => {
    const open: Chat = {
      id: "r1",
      type: "refine",
      title: "x",
      messages: [{ id: "m1", role: "assistant", content: "draft" }],
      seed: { kind: "blank" },
    };
    const start = { ...initialChatState, refineChat: open };
    const next = chatSliceReducer(start, refineCandidateMarked({ messageId: "m1" }));
    expect(next.refineChat?.messages[0].refineCandidate).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests and confirm they all fail**

Run: `npm run test -- tests/core/store/slices/chat.test.ts`
Expected: all failing — `chatSliceReducer` and helpers don't exist yet.

- [ ] **Step 3: Implement the slice**

```ts
// src/core/store/slices/chat.ts
import { createSlice } from "nai-store";
import type { Chat, ChatMessage } from "../../chat-types/types";

export interface ChatSliceState {
  chats: Chat[];
  activeChatId: string | null;
  refineChat: Chat | null;
}

function makeDefaultBrainstorm(): Chat {
  return {
    id: api.v1.uuid(),
    type: "brainstorm",
    title: "Brainstorm 1",
    subMode: "cowriter",
    messages: [],
    seed: { kind: "blank" },
  };
}

const seedChat = makeDefaultBrainstorm();
export const initialChatState: ChatSliceState = {
  chats: [seedChat],
  activeChatId: seedChat.id,
  refineChat: null,
};

function mapChat(state: ChatSliceState, id: string, fn: (c: Chat) => Chat): ChatSliceState {
  return { ...state, chats: state.chats.map((c) => (c.id === id ? fn(c) : c)) };
}

export const chatSlice = createSlice({
  name: "chat",
  initialState: initialChatState,
  reducers: {
    chatCreated: (state, payload: { chat: Chat }) => ({
      ...state,
      chats: [...state.chats, payload.chat],
      activeChatId: payload.chat.id,
    }),

    chatRenamed: (state, payload: { id: string; title: string }) =>
      mapChat(state, payload.id, (c) => ({ ...c, title: payload.title })),

    chatSwitched: (state, payload: { id: string }) => {
      if (!state.chats.some((c) => c.id === payload.id)) return state;
      return { ...state, activeChatId: payload.id };
    },

    chatDeleted: (state, payload: { id: string }) => {
      if (state.chats.length <= 1) return state;
      const chats = state.chats.filter((c) => c.id !== payload.id);
      const activeChatId =
        state.activeChatId === payload.id ? chats[chats.length - 1].id : state.activeChatId;
      return { ...state, chats, activeChatId };
    },

    subModeChanged: (state, payload: { id: string; subMode: string }) =>
      mapChat(state, payload.id, (c) => ({ ...c, subMode: payload.subMode })),

    messageAdded: (state, payload: { chatId: string; message: ChatMessage }) =>
      mapChat(state, payload.chatId, (c) => ({
        ...c,
        messages: [...c.messages, payload.message],
      })),

    messageUpdated: (state, payload: { chatId: string; id: string; content: string }) =>
      mapChat(state, payload.chatId, (c) => ({
        ...c,
        messages: c.messages.map((m) =>
          m.id === payload.id ? { ...m, content: payload.content } : m,
        ),
      })),

    messageAppended: (state, payload: { chatId: string; id: string; content: string }) =>
      mapChat(state, payload.chatId, (c) => ({
        ...c,
        messages: c.messages.map((m) =>
          m.id === payload.id ? { ...m, content: m.content + payload.content } : m,
        ),
      })),

    messageRemoved: (state, payload: { chatId: string; id: string }) =>
      mapChat(state, payload.chatId, (c) => ({
        ...c,
        messages: c.messages.filter((m) => m.id !== payload.id),
      })),

    messagesPrunedAfter: (state, payload: { chatId: string; id: string }) =>
      mapChat(state, payload.chatId, (c) => {
        const idx = c.messages.findIndex((m) => m.id === payload.id);
        if (idx === -1) return c;
        const target = c.messages[idx];
        const cut = target.role === "user" ? idx + 1 : idx;
        return { ...c, messages: c.messages.slice(0, cut) };
      }),

    refineChatOpened: (state, payload: { chat: Chat }) => {
      if (state.refineChat) return state; // single-slot collision: ignore
      return { ...state, refineChat: payload.chat };
    },

    refineChatCleared: (state) => ({ ...state, refineChat: null }),

    refineMessageAdded: (state, payload: { message: ChatMessage }) => {
      if (!state.refineChat) return state;
      return {
        ...state,
        refineChat: {
          ...state.refineChat,
          messages: [...state.refineChat.messages, payload.message],
        },
      };
    },

    refineMessageAppended: (state, payload: { id: string; content: string }) => {
      if (!state.refineChat) return state;
      return {
        ...state,
        refineChat: {
          ...state.refineChat,
          messages: state.refineChat.messages.map((m) =>
            m.id === payload.id ? { ...m, content: m.content + payload.content } : m,
          ),
        },
      };
    },

    refineCandidateMarked: (state, payload: { messageId: string }) => {
      if (!state.refineChat) return state;
      return {
        ...state,
        refineChat: {
          ...state.refineChat,
          messages: state.refineChat.messages.map((m) =>
            m.id === payload.messageId ? { ...m, refineCandidate: true } : m,
          ),
        },
      };
    },
  },
});

export const chatSliceReducer = chatSlice.reducer;
export const {
  chatCreated,
  chatRenamed,
  chatSwitched,
  chatDeleted,
  subModeChanged,
  messageAdded,
  messageUpdated,
  messageAppended,
  messageRemoved,
  messagesPrunedAfter,
  refineChatOpened,
  refineChatCleared,
  refineMessageAdded,
  refineMessageAppended,
  refineCandidateMarked,
} = chatSlice.actions;

export function activeSavedChat(state: ChatSliceState): Chat | null {
  if (!state.activeChatId) return null;
  return state.chats.find((c) => c.id === state.activeChatId) ?? null;
}
```

- [ ] **Step 4: Run tests and confirm they all pass**

Run: `npm run test -- tests/core/store/slices/chat.test.ts`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/core/store/slices/chat.ts tests/core/store/slices/chat.test.ts
git commit -m "feat: add chat slice with single-slot refine state"
```

---

### Task 3: Wire chat slice into the root reducer alongside existing brainstorm slice

This task **adds** the chat slice without removing the brainstorm slice. The root reducer will hold both during the transition; cleanup happens in the final phase.

**Files:**
- Modify: `src/core/store/index.ts`
- Modify: `src/core/store/types.ts` (add `chat` to `RootState`)

- [ ] **Step 1: Update `RootState` and add a `chat` interface stub**

Edit `src/core/store/types.ts`:

```ts
// Add near the other slice imports/types, after BrainstormState:
import type { Chat } from "../chat-types/types";

export interface ChatState {
  chats: Chat[];
  activeChatId: string | null;
  refineChat: Chat | null;
}

// Add chat: ChatState; to RootState:
export interface RootState {
  story: StoryState;
  brainstorm: BrainstormState;
  chat: ChatState;
  ui: UIState;
  runtime: RuntimeState;
  world: WorldState;
  foundation: FoundationState;
}
```

- [ ] **Step 2: Update the root reducer**

Edit `src/core/store/index.ts`:

```ts
// Add import at top:
import { chatSlice, initialChatState } from "./slices/chat";

// In sliceReducer combineReducers call, add chat:
const sliceReducer = combineReducers({
  story: storySlice.reducer,
  brainstorm: brainstormSlice.reducer,
  chat: chatSlice.reducer,
  ui: uiSlice.reducer,
  runtime: runtimeSlice.reducer,
  world: worldSlice.reducer,
  foundation: foundationSlice.reducer,
});

// In rootReducer's PERSISTED_DATA_LOADED branch, append after the brainstorm
// merge logic:
chat: data.chat
  ? data.chat
  : current.chat,

// Export the chat actions at the bottom alongside other slice exports:
export * from "./slices/chat";
```

Also extend `PersistedData` near the top of `index.ts`:

```ts
import type { ChatState } from "./types";
// ...
interface PersistedData {
  story?: StoryState;
  brainstorm?: { chats: BrainstormChat[]; currentChatIndex: number };
  chat?: ChatState;
  world?: WorldState;
  foundation?: FoundationState;
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 4: Run the full test suite**

Run: `npm run test`
Expected: all tests still pass; the new chat slice is wired but unused by callers.

- [ ] **Step 5: Commit**

```bash
git add src/core/store/index.ts src/core/store/types.ts
git commit -m "feat: register chat slice in root reducer"
```

---

### Task 4: Add brainstorm → chat migration in `src/ui/plugin.ts`

The plugin entry point reads persisted data via `api.v1.storyStorage`. We add a one-shot migration that converts v0.11 `brainstorm.chats[]` into the new `chat` shape and clears the old key.

**Files:**
- Modify: `src/ui/plugin.ts` (find the location where `api.v1.storyStorage.get("kse-persist")` is read, or where `persistedDataLoaded` is dispatched)
- Test: `tests/core/store/migration.test.ts` (new)

- [ ] **Step 1: Read the current plugin entry to find the persisted-data hydration call**

Run: `grep -n "kse-persist\|persistedDataLoaded\|storyStorage.get" src/ui/plugin.ts`
Note the line where persisted data is loaded; the migration goes immediately before `dispatch(persistedDataLoaded(...))`.

- [ ] **Step 2: Add a migration helper next to the hydration logic**

In `src/ui/plugin.ts`, add (or replace the equivalent) hydration block:

```ts
import { migrateBrainstormToChat } from "../core/store/migrations/brainstorm-to-chat";

// where the persisted blob is loaded:
const persisted = await api.v1.storyStorage.get("kse-persist");
const migrated = migrateBrainstormToChat(persisted ?? {});
if (migrated.touched) {
  await api.v1.storyStorage.set("kse-persist", migrated.data);
  api.v1.ui.toast("Brainstorm chats migrated to new chat system.", { type: "info" });
}
store.dispatch(persistedDataLoaded(migrated.data));
```

- [ ] **Step 3: Write failing tests for the migration helper**

```ts
// tests/core/store/migration.test.ts
import { describe, it, expect } from "vitest";
import { migrateBrainstormToChat } from "../../../src/core/store/migrations/brainstorm-to-chat";

describe("migrateBrainstormToChat", () => {
  it("converts v0.11 brainstorm.chats to chat slice shape", () => {
    const v11 = {
      brainstorm: {
        chats: [
          {
            id: "c1",
            title: "Brainstorm 1",
            mode: "cowriter",
            messages: [{ id: "m1", role: "user", content: "hi" }],
          },
          {
            id: "c2",
            title: "Brainstorm 2",
            mode: "critic",
            messages: [],
          },
        ],
        currentChatIndex: 1,
      },
    };
    const result = migrateBrainstormToChat(v11);
    expect(result.touched).toBe(true);
    expect(result.data.brainstorm).toBeUndefined();
    expect(result.data.chat).toBeDefined();
    expect(result.data.chat.chats).toHaveLength(2);
    expect(result.data.chat.chats[0]).toMatchObject({
      id: "c1",
      type: "brainstorm",
      title: "Brainstorm 1",
      subMode: "cowriter",
    });
    expect(result.data.chat.chats[1].subMode).toBe("critic");
    expect(result.data.chat.activeChatId).toBe("c2");
    expect(result.data.chat.refineChat).toBeNull();
  });

  it("is idempotent: running on already-migrated data is a no-op", () => {
    const already = {
      chat: {
        chats: [
          {
            id: "c1",
            type: "brainstorm",
            title: "x",
            subMode: "cowriter",
            messages: [],
            seed: { kind: "blank" },
          },
        ],
        activeChatId: "c1",
        refineChat: null,
      },
    };
    const result = migrateBrainstormToChat(already);
    expect(result.touched).toBe(false);
    expect(result.data).toEqual(already);
  });

  it("handles empty input by returning unchanged data", () => {
    const empty = {};
    const result = migrateBrainstormToChat(empty);
    expect(result.touched).toBe(false);
    expect(result.data).toEqual(empty);
  });

  it("falls back to first chat when currentChatIndex is out of range", () => {
    const v11 = {
      brainstorm: {
        chats: [{ id: "c1", title: "x", mode: "cowriter", messages: [] }],
        currentChatIndex: 7,
      },
    };
    const result = migrateBrainstormToChat(v11);
    expect(result.data.chat.activeChatId).toBe("c1");
  });
});
```

- [ ] **Step 4: Run tests, confirm failure**

Run: `npm run test -- tests/core/store/migration.test.ts`
Expected: failing — module doesn't exist.

- [ ] **Step 5: Implement the migration helper**

```ts
// src/core/store/migrations/brainstorm-to-chat.ts
import type { Chat } from "../../chat-types/types";

interface V11Brainstorm {
  chats: Array<{
    id: string;
    title: string;
    mode: string;
    messages: Array<{ id: string; role: "user" | "assistant" | "system"; content: string }>;
  }>;
  currentChatIndex: number;
}

interface PersistedShape {
  brainstorm?: V11Brainstorm;
  chat?: { chats: Chat[]; activeChatId: string | null; refineChat: Chat | null };
  [key: string]: unknown;
}

export interface MigrationResult {
  touched: boolean;
  data: PersistedShape;
}

export function migrateBrainstormToChat(input: PersistedShape): MigrationResult {
  if (input.chat) return { touched: false, data: input };
  if (!input.brainstorm?.chats) return { touched: false, data: input };

  const chats: Chat[] = input.brainstorm.chats.map((c) => ({
    id: c.id,
    type: "brainstorm",
    title: c.title,
    subMode: c.mode,
    messages: c.messages,
    seed: { kind: "blank" },
  }));

  const idx = input.brainstorm.currentChatIndex;
  const active = chats[idx] ?? chats[0];

  const next: PersistedShape = { ...input };
  delete next.brainstorm;
  next.chat = {
    chats,
    activeChatId: active?.id ?? null,
    refineChat: null,
  };
  return { touched: true, data: next };
}
```

- [ ] **Step 6: Run tests, expect PASS**

Run: `npm run test -- tests/core/store/migration.test.ts`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add src/core/store/migrations/brainstorm-to-chat.ts tests/core/store/migration.test.ts src/ui/plugin.ts
git commit -m "feat: migrate v0.11 brainstorm sessions to new chat slice"
```

---

## Phase 2 — Chat type specs

### Task 5: Brainstorm spec

**Files:**
- Create: `src/core/chat-types/brainstorm.ts`
- Test: `tests/core/chat-types/brainstorm.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/core/chat-types/brainstorm.test.ts
import { describe, it, expect, vi } from "vitest";
import { brainstormSpec } from "../../../src/core/chat-types/brainstorm";
import type { Chat, SpecCtx } from "../../../src/core/chat-types/types";

const ctx: SpecCtx = {
  getState: vi.fn(),
  dispatch: vi.fn(),
};

const brainstormChat = (subMode: "cowriter" | "critic" = "cowriter"): Chat => ({
  id: "c1",
  type: "brainstorm",
  title: "Brainstorm 1",
  subMode,
  messages: [
    { id: "m1", role: "user", content: "hi" },
    { id: "m2", role: "assistant", content: "hello" },
  ],
  seed: { kind: "blank" },
});

describe("brainstormSpec", () => {
  it("declares save lifecycle and cowriter/critic submodes", () => {
    expect(brainstormSpec.lifecycle).toBe("save");
    expect(brainstormSpec.subModes).toContain("cowriter");
    expect(brainstormSpec.subModes).toContain("critic");
    expect(brainstormSpec.defaultSubMode).toBe("cowriter");
  });

  it("initialize seeds an empty cowriter brainstorm", () => {
    const init = brainstormSpec.initialize({ kind: "blank" }, ctx);
    expect(init.title).toMatch(/Brainstorm/);
    expect(init.subMode).toBe("cowriter");
    expect(init.initialMessages).toEqual([]);
  });

  it("systemPromptFor switches by subMode", () => {
    const co = brainstormSpec.systemPromptFor(brainstormChat("cowriter"), ctx);
    const cr = brainstormSpec.systemPromptFor(brainstormChat("critic"), ctx);
    expect(co).not.toEqual(cr);
    expect(co.length).toBeGreaterThan(0);
    expect(cr.length).toBeGreaterThan(0);
  });

  it("contextSlice returns the full transcript", () => {
    const chat = brainstormChat();
    expect(brainstormSpec.contextSlice(chat, ctx)).toEqual(chat.messages);
  });

  it("headerControls includes sessions, sub-mode toggle, and summarize", () => {
    const controls = brainstormSpec.headerControls(brainstormChat(), ctx);
    const kinds = controls.map((c) => c.kind);
    expect(kinds).toContain("sessionsButton");
    expect(kinds).toContain("subModeToggle");
    expect(kinds).toContain("summarizeButton");
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `npm run test -- tests/core/chat-types/brainstorm.test.ts`

- [ ] **Step 3: Implement the spec**

```ts
// src/core/chat-types/brainstorm.ts
import type { ChatTypeSpec, Chat, SpecCtx, ChatSeed } from "./types";
import {
  BRAINSTORM_PROMPT,
  BRAINSTORM_CRITIC_PROMPT,
} from "../utils/prompts";

type BrainstormSubMode = "cowriter" | "critic";

const SUB_MODES: readonly BrainstormSubMode[] = ["cowriter", "critic"] as const;

export const brainstormSpec: ChatTypeSpec<BrainstormSubMode> = {
  id: "brainstorm",
  displayName: "Brainstorm",
  lifecycle: "save",
  subModes: SUB_MODES,
  defaultSubMode: "cowriter",

  initialize(_seed: ChatSeed, _ctx: SpecCtx) {
    return {
      title: "Brainstorm",
      initialMessages: [],
      subMode: "cowriter",
    };
  },

  systemPromptFor(chat: Chat, _ctx: SpecCtx): string {
    return chat.subMode === "critic" ? BRAINSTORM_CRITIC_PROMPT : BRAINSTORM_PROMPT;
  },

  contextSlice(chat: Chat): import("./types").ChatMessage[] {
    return chat.messages;
  },

  headerControls() {
    return [
      { id: "sessions", kind: "sessionsButton" },
      { id: "sub-mode", kind: "subModeToggle" },
      { id: "summarize", kind: "summarizeButton" },
    ];
  },
};
```

- [ ] **Step 4: Run tests, expect PASS**

Run: `npm run test -- tests/core/chat-types/brainstorm.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/core/chat-types/brainstorm.ts tests/core/chat-types/brainstorm.test.ts
git commit -m "feat: add brainstorm chat-type spec with cowriter/critic submodes"
```

---

### Task 6: Summary spec

**Files:**
- Create: `src/core/chat-types/summary.ts`
- Test: `tests/core/chat-types/summary.test.ts`
- Modify: `src/core/utils/prompts.ts` (verify or add `BRAINSTORM_SUMMARIZE_PROMPT` and `STORY_TEXT_SUMMARIZE_PROMPT` constants — see Step 1)

- [ ] **Step 1: Verify the two summary prompts exist**

Run: `grep -n "SUMMARIZE_PROMPT\|SUMMARY_PROMPT" src/core/utils/prompts.ts`

If `BRAINSTORM_SUMMARIZE_PROMPT` (the existing brainstorm-summarize prompt used by `buildSummarizeStrategy` in `context-builder.ts`) is not exported, export it. If `STORY_TEXT_SUMMARIZE_PROMPT` does not exist, add it:

```ts
// Append to src/core/utils/prompts.ts
export const STORY_TEXT_SUMMARIZE_PROMPT = `Read the story text below and produce dense declarative present-tense notes capturing setting, characters, situations, and unresolved tensions. Output the notes only — no preamble, no headers.`;
```

- [ ] **Step 2: Write failing tests**

```ts
// tests/core/chat-types/summary.test.ts
import { describe, it, expect, vi } from "vitest";
import { summarySpec } from "../../../src/core/chat-types/summary";
import type { Chat, SpecCtx } from "../../../src/core/chat-types/types";

const ctx: SpecCtx = { getState: vi.fn(), dispatch: vi.fn() };

const chatWithMessages = (assistantContent: string): Chat => ({
  id: "s1",
  type: "summary",
  title: "Summary",
  messages: [{ id: "m1", role: "assistant", content: assistantContent }],
  seed: { kind: "fromChat", sourceChatId: "src" },
});

describe("summarySpec", () => {
  it("is a save-lifecycle type with no submodes", () => {
    expect(summarySpec.lifecycle).toBe("save");
    expect(summarySpec.subModes).toBeUndefined();
  });

  it("initialize from brainstorm seeds the source transcript as a system message", () => {
    const sourceMessages = [
      { id: "u1", role: "user" as const, content: "thoughts on noir" },
      { id: "a1", role: "assistant" as const, content: "noir is fun" },
    ];
    const localCtx: SpecCtx = {
      getState: () =>
        ({
          chat: {
            chats: [
              {
                id: "src",
                type: "brainstorm",
                title: "Source",
                messages: sourceMessages,
                seed: { kind: "blank" },
              },
            ],
            activeChatId: "src",
            refineChat: null,
          },
        }) as unknown as ReturnType<SpecCtx["getState"]>,
      dispatch: vi.fn(),
    };
    const init = summarySpec.initialize(
      { kind: "fromChat", sourceChatId: "src" },
      localCtx,
    );
    expect(init.initialMessages.length).toBeGreaterThan(0);
    expect(init.initialMessages[0].role).toBe("system");
    expect(init.initialMessages[0].content).toContain("noir is fun");
  });

  it("initialize from story text seeds the text as a system message", () => {
    const init = summarySpec.initialize(
      { kind: "fromStoryText", sourceText: "Once upon a time..." },
      ctx,
    );
    expect(init.initialMessages[0].content).toContain("Once upon a time");
  });

  it("contextSlice returns only the last assistant turn", () => {
    const chat = chatWithMessages("the latest summary");
    chat.messages.unshift({ id: "old", role: "assistant", content: "older" });
    const sliced = summarySpec.contextSlice(chat, ctx);
    expect(sliced).toHaveLength(1);
    expect(sliced[0].content).toBe("the latest summary");
  });

  it("contextSlice returns empty when no assistant turn exists", () => {
    const chat = chatWithMessages("ok");
    chat.messages = [{ id: "u", role: "user", content: "hi" }];
    expect(summarySpec.contextSlice(chat, ctx)).toEqual([]);
  });
});
```

- [ ] **Step 3: Run tests, expect failure**

Run: `npm run test -- tests/core/chat-types/summary.test.ts`

- [ ] **Step 4: Implement the spec**

```ts
// src/core/chat-types/summary.ts
import type { ChatTypeSpec, Chat, ChatMessage, ChatSeed, SpecCtx } from "./types";
import {
  BRAINSTORM_SUMMARIZE_PROMPT,
  STORY_TEXT_SUMMARIZE_PROMPT,
} from "../utils/prompts";

function findChatById(ctx: SpecCtx, id: string): Chat | undefined {
  return ctx.getState().chat.chats.find((c) => c.id === id);
}

function transcriptToText(messages: ChatMessage[]): string {
  return messages
    .filter((m) => m.role !== "system")
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n");
}

export const summarySpec: ChatTypeSpec = {
  id: "summary",
  displayName: "Summary",
  lifecycle: "save",

  initialize(seed: ChatSeed, ctx: SpecCtx) {
    if (seed.kind === "fromChat") {
      const source = findChatById(ctx, seed.sourceChatId);
      const transcript = source ? transcriptToText(source.messages) : "";
      return {
        title: source ? `Summary: ${source.title}` : "Summary",
        initialMessages: [
          {
            id: api.v1.uuid(),
            role: "system",
            content: `Source brainstorm transcript:\n${transcript}`,
          },
        ],
      };
    }
    if (seed.kind === "fromStoryText") {
      return {
        title: "Summary: Story Text",
        initialMessages: [
          {
            id: api.v1.uuid(),
            role: "system",
            content: `Story text:\n${seed.sourceText}`,
          },
        ],
      };
    }
    return { title: "Summary", initialMessages: [] };
  },

  systemPromptFor(chat: Chat): string {
    return chat.seed.kind === "fromStoryText"
      ? STORY_TEXT_SUMMARIZE_PROMPT
      : BRAINSTORM_SUMMARIZE_PROMPT;
  },

  contextSlice(chat: Chat): ChatMessage[] {
    const lastAssistant = [...chat.messages].reverse().find((m) => m.role === "assistant");
    return lastAssistant ? [lastAssistant] : [];
  },

  headerControls() {
    return [
      { id: "sessions", kind: "sessionsButton" },
      { id: "source-label", kind: "label" },
    ];
  },
};
```

- [ ] **Step 5: Run tests, expect PASS**

- [ ] **Step 6: Commit**

```bash
git add src/core/chat-types/summary.ts tests/core/chat-types/summary.test.ts src/core/utils/prompts.ts
git commit -m "feat: add summary chat-type spec for brainstorm/story-text seeds"
```

---

### Task 7: Refine spec

**Files:**
- Create: `src/core/chat-types/refine.ts`
- Test: `tests/core/chat-types/refine.test.ts`

- [ ] **Step 1: Add the refine system prompt to `prompts.ts`**

Append to `src/core/utils/prompts.ts`:

```ts
export const REFINE_SYSTEM_PROMPT = `You are rewriting a Story Engine field per the user's instructions. Preserve any required template structure unless the user asks otherwise. Output ONLY the rewritten field text — no preamble, no headers, no commentary.`;
```

- [ ] **Step 2: Write failing tests**

```ts
// tests/core/chat-types/refine.test.ts
import { describe, it, expect, vi } from "vitest";
import { refineSpec } from "../../../src/core/chat-types/refine";
import type { Chat, SpecCtx } from "../../../src/core/chat-types/types";

const ctx: SpecCtx = { getState: vi.fn(), dispatch: vi.fn() };

const refineChat = (): Chat => ({
  id: "r1",
  type: "refine",
  title: "Refining: Intent",
  messages: [
    { id: "u1", role: "user", content: "make it tighter" },
    { id: "a1", role: "assistant", content: "tighter version", refineCandidate: true },
  ],
  seed: { kind: "fromField", sourceFieldId: "intent", sourceText: "old" },
  refineTarget: { fieldId: "intent", originalText: "old" },
});

describe("refineSpec", () => {
  it("declares commit-discard lifecycle", () => {
    expect(refineSpec.lifecycle).toBe("commit-discard");
    expect(refineSpec.subModes).toBeUndefined();
  });

  it("initialize returns an empty transcript and refine title", () => {
    const init = refineSpec.initialize(
      { kind: "fromField", sourceFieldId: "intent", sourceText: "old" },
      ctx,
    );
    expect(init.title).toContain("intent");
    expect(init.initialMessages).toEqual([]);
  });

  it("systemPromptFor returns the refine instruction prompt", () => {
    expect(refineSpec.systemPromptFor(refineChat(), ctx)).toMatch(/rewriting/i);
  });

  it("contextSlice returns empty (refine never participates in SE prefix)", () => {
    expect(refineSpec.contextSlice(refineChat(), ctx)).toEqual([]);
  });

  it("headerControls is just the target label", () => {
    const controls = refineSpec.headerControls(refineChat(), ctx);
    expect(controls.map((c) => c.kind)).toEqual(["label"]);
  });
});
```

- [ ] **Step 3: Run tests, expect failure**

- [ ] **Step 4: Implement the spec**

```ts
// src/core/chat-types/refine.ts
import type { ChatTypeSpec, Chat, ChatMessage, ChatSeed, SpecCtx } from "./types";
import { REFINE_SYSTEM_PROMPT } from "../utils/prompts";

export const refineSpec: ChatTypeSpec = {
  id: "refine",
  displayName: "Refine",
  lifecycle: "commit-discard",

  initialize(seed: ChatSeed, _ctx: SpecCtx) {
    const fieldId = seed.kind === "fromField" ? seed.sourceFieldId : "field";
    return { title: `Refining: ${fieldId}`, initialMessages: [] };
  },

  systemPromptFor(_chat: Chat, _ctx: SpecCtx): string {
    return REFINE_SYSTEM_PROMPT;
  },

  contextSlice(_chat: Chat): ChatMessage[] {
    return [];
  },

  headerControls() {
    return [{ id: "target", kind: "label" }];
  },
};
```

- [ ] **Step 5: Run tests, expect PASS**

- [ ] **Step 6: Commit**

```bash
git add src/core/chat-types/refine.ts tests/core/chat-types/refine.test.ts src/core/utils/prompts.ts
git commit -m "feat: add refine chat-type spec (commit-discard lifecycle)"
```

---

### Task 8: Spec registry

**Files:**
- Create: `src/core/chat-types/index.ts`
- Test: `tests/core/chat-types/registry.test.ts`

- [ ] **Step 1: Failing test**

```ts
// tests/core/chat-types/registry.test.ts
import { describe, it, expect } from "vitest";
import {
  getChatTypeSpec,
  CHAT_TYPE_REGISTRY,
} from "../../../src/core/chat-types/index";

describe("chat-type registry", () => {
  it("registers brainstorm, summary, refine", () => {
    expect(CHAT_TYPE_REGISTRY.brainstorm).toBeDefined();
    expect(CHAT_TYPE_REGISTRY.summary).toBeDefined();
    expect(CHAT_TYPE_REGISTRY.refine).toBeDefined();
  });

  it("getChatTypeSpec returns the registered spec", () => {
    expect(getChatTypeSpec("brainstorm").id).toBe("brainstorm");
  });

  it("getChatTypeSpec throws on unknown id", () => {
    expect(() => getChatTypeSpec("nope")).toThrow(/no chat-type spec/i);
  });
});
```

- [ ] **Step 2: Run, confirm failure**

- [ ] **Step 3: Implement registry**

```ts
// src/core/chat-types/index.ts
import type { ChatTypeSpec } from "./types";
import { brainstormSpec } from "./brainstorm";
import { summarySpec } from "./summary";
import { refineSpec } from "./refine";

export const CHAT_TYPE_REGISTRY: Record<string, ChatTypeSpec> = {
  brainstorm: brainstormSpec,
  summary: summarySpec,
  refine: refineSpec,
};

export function getChatTypeSpec(id: string): ChatTypeSpec {
  const spec = CHAT_TYPE_REGISTRY[id];
  if (!spec) throw new Error(`no chat-type spec registered for id: ${id}`);
  return spec;
}

export type { ChatTypeSpec, Chat, ChatMessage, ChatSeed, RefineContext, RefineTarget, SpecCtx } from "./types";
```

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/core/chat-types/index.ts tests/core/chat-types/registry.test.ts
git commit -m "feat: chat-type registry index with getChatTypeSpec"
```

---

## Phase 3 — Strategy wiring

### Task 9: Add `refineContext` knob to existing field-generate strategies

We extend each existing factory's signature to accept an optional `{ refineContext?: RefineContext }` second parameter. When absent, behavior is unchanged. When present, the factory delegates the **tail** of its message list to `buildRefineTail` (Task 10).

This task only changes signatures and threads the param through — Task 10 implements the tail composer.

**Files (all modify):**
- `src/core/utils/context-builder.ts` (Foundation/ATTG/Style/Contract strategies live here — verify with Step 1)
- `src/core/utils/lorebook-strategy.ts` (lorebook content + keys factories)
- Any other file exporting field-generate factories listed in the registry (Step 1)

- [ ] **Step 1: Inventory the factories that need the knob**

Run: `grep -nE "^export (const|function) build(Intent|Attg|Style|Contract|LorebookContent|LorebookKeys|Foundation)" src/core/utils/*.ts`

Expected output names should match the keys we'll register in Task 11. Note any names that differ from what the spec assumed (e.g. if `buildIntentStrategy` is actually `buildFoundationFieldStrategy(fieldId: "intent")`). Adjust subsequent tasks if names differ — the registry map is the source of truth.

- [ ] **Step 2: Add the optional param to each factory**

For each factory `buildFooStrategy(getState, ...existingArgs)`, change the signature to:

```ts
import type { RefineContext } from "../chat-types/types";

export const buildFooStrategy = (
  getState: () => RootState,
  ...existingArgs: never[],
  opts?: { refineContext?: RefineContext },
): GenerationStrategy => {
  // ... existing logic builds prefixMessages
  const baseMessages = [...prefixMessages, ...domainMessages];
  if (opts?.refineContext) {
    return {
      // ...existing strategy fields
      messageFactory: () => [
        ...baseMessages,
        // Tail from Task 10's helper — for now we leave a TODO comment;
        // Task 10 imports buildRefineTail from refine-strategy.ts and replaces this.
        ...buildRefineTail(opts.refineContext),
      ],
    };
  }
  return existingStrategy;
};
```

**Important:** the factories use `messageFactory` (JIT), not `messages`. Make sure the tail is composed inside the factory closure, not at strategy-creation time, so the chat history reads the latest state on each call.

If a factory has multiple existing parameters in front of `getState`, place `opts` at the end. Keep all existing call sites working without changes — `opts` is optional.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors. (No tests yet — this task is a refactor in preparation for Task 10.)

- [ ] **Step 4: Commit**

```bash
git add src/core/utils/context-builder.ts src/core/utils/lorebook-strategy.ts
git commit -m "refactor: add optional refineContext param to field strategy factories"
```

---

### Task 10: Implement `buildRefineTail`

**Files:**
- Create: `src/core/utils/refine-strategy.ts`
- Test: `tests/core/utils/refine-strategy.test.ts`

- [ ] **Step 1: Failing test**

```ts
// tests/core/utils/refine-strategy.test.ts
import { describe, it, expect } from "vitest";
import { buildRefineTail } from "../../../src/core/utils/refine-strategy";
import type { RefineContext } from "../../../src/core/chat-types/types";

describe("buildRefineTail", () => {
  const ctx = (history: RefineContext["history"] = []): RefineContext => ({
    fieldId: "intent",
    currentText: "current value",
    history,
  });

  it("emits a system instruction first", () => {
    const tail = buildRefineTail(ctx());
    expect(tail[0].role).toBe("system");
    expect(tail[0].content).toMatch(/rewriting/i);
  });

  it("includes the current field text labelled as the refine target", () => {
    const tail = buildRefineTail(ctx());
    const sys = tail.find((m) => m.role === "system" && m.content.includes("current value"));
    expect(sys).toBeDefined();
  });

  it("appends user/assistant turns from history in order", () => {
    const history = [
      { id: "u1", role: "user" as const, content: "tighter" },
      { id: "a1", role: "assistant" as const, content: "tightened" },
      { id: "u2", role: "user" as const, content: "shorter" },
    ];
    const tail = buildRefineTail(ctx(history));
    const tailRoles = tail.map((m) => m.role);
    expect(tailRoles).toEqual(["system", "system", "user", "assistant", "user"]);
  });

  it("filters out system messages from history", () => {
    const tail = buildRefineTail(
      ctx([{ id: "s1", role: "system" as const, content: "ignore me" }]),
    );
    expect(tail.find((m) => m.content === "ignore me")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run, expect failure**

- [ ] **Step 3: Implement**

```ts
// src/core/utils/refine-strategy.ts
import type { RefineContext } from "../chat-types/types";
import { REFINE_SYSTEM_PROMPT } from "./prompts";
import type { Message } from "nai-gen-x";

export function buildRefineTail(refine: RefineContext): Message[] {
  const tail: Message[] = [
    { role: "system", content: REFINE_SYSTEM_PROMPT },
    {
      role: "system",
      content: `=== REFINE TARGET (${refine.fieldId}) ===\n${refine.currentText}\n=== END TARGET ===`,
    },
  ];
  for (const msg of refine.history) {
    if (msg.role === "system") continue;
    tail.push({ role: msg.role, content: msg.content });
  }
  return tail;
}
```

- [ ] **Step 4: Run tests, expect PASS**

- [ ] **Step 5: Replace any `// TODO: import buildRefineTail` placeholders left from Task 9 with the actual import:**

In each factory in `src/core/utils/context-builder.ts` and `src/core/utils/lorebook-strategy.ts`, add:

```ts
import { buildRefineTail } from "./refine-strategy";
```

Confirm `npx tsc --noEmit -p tsconfig.json` is clean.

- [ ] **Step 6: Commit**

```bash
git add src/core/utils/refine-strategy.ts tests/core/utils/refine-strategy.test.ts src/core/utils/context-builder.ts src/core/utils/lorebook-strategy.ts
git commit -m "feat: buildRefineTail composes refine instructions over field strategy prefix"
```

---

### Task 11: Field-strategy registry

**Files:**
- Create: `src/core/utils/field-strategy-registry.ts`
- Test: `tests/core/utils/field-strategy-registry.test.ts`

- [ ] **Step 1: Failing test**

```ts
// tests/core/utils/field-strategy-registry.test.ts
import { describe, it, expect } from "vitest";
import { FIELD_STRATEGIES, getFieldStrategy } from "../../../src/core/utils/field-strategy-registry";

describe("field-strategy registry", () => {
  it("includes every field that exposes refine in v1", () => {
    expect(FIELD_STRATEGIES.intent).toBeDefined();
    expect(FIELD_STRATEGIES.attg).toBeDefined();
    expect(FIELD_STRATEGIES.style).toBeDefined();
    expect(FIELD_STRATEGIES.contractRequired).toBeDefined();
    expect(FIELD_STRATEGIES.contractProhibited).toBeDefined();
    expect(FIELD_STRATEGIES.contractEmphasis).toBeDefined();
    expect(FIELD_STRATEGIES.lorebookContent).toBeDefined();
    expect(FIELD_STRATEGIES.lorebookKeys).toBeDefined();
  });

  it("getFieldStrategy throws on unknown id", () => {
    expect(() => getFieldStrategy("nope")).toThrow(/no field strategy/i);
  });
});
```

- [ ] **Step 2: Run, expect failure**

- [ ] **Step 3: Implement**

```ts
// src/core/utils/field-strategy-registry.ts
import type { RootState, GenerationStrategy } from "../store/types";
import type { RefineContext } from "../chat-types/types";

// Adjust these imports to match the actual exported names in the codebase.
// Confirm during Task 9 inventory step.
import {
  buildIntentStrategy,
  buildAttgStrategy,
  buildStyleStrategy,
  buildContractRequiredStrategy,
  buildContractProhibitedStrategy,
  buildContractEmphasisStrategy,
} from "./context-builder";
import {
  createLorebookContentFactory,
  createLorebookKeysFactory,
} from "./lorebook-strategy";

export type FieldStrategyFactory = (
  getState: () => RootState,
  opts?: { refineContext?: RefineContext; entryId?: string; requestId?: string },
) => GenerationStrategy;

export const FIELD_STRATEGIES: Record<string, FieldStrategyFactory> = {
  intent: (gs, opts) => buildIntentStrategy(gs, opts),
  attg: (gs, opts) => buildAttgStrategy(gs, opts),
  style: (gs, opts) => buildStyleStrategy(gs, opts),
  contractRequired: (gs, opts) => buildContractRequiredStrategy(gs, opts),
  contractProhibited: (gs, opts) => buildContractProhibitedStrategy(gs, opts),
  contractEmphasis: (gs, opts) => buildContractEmphasisStrategy(gs, opts),
  lorebookContent: (gs, opts) =>
    createLorebookContentFactory(gs, opts?.entryId ?? "", opts?.requestId ?? "", {
      refineContext: opts?.refineContext,
    }),
  lorebookKeys: (gs, opts) =>
    createLorebookKeysFactory(gs, opts?.entryId ?? "", { refineContext: opts?.refineContext }),
};

export function getFieldStrategy(id: string): FieldStrategyFactory {
  const f = FIELD_STRATEGIES[id];
  if (!f) throw new Error(`no field strategy registered for id: ${id}`);
  return f;
}
```

If during Task 9 inventory the actual names differ (e.g. `buildFoundationFieldStrategy(getState, "intent")` instead of `buildIntentStrategy`), reshape the wrapper functions here so the registry's outer signature stays `(gs, opts) => GenerationStrategy`.

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/core/utils/field-strategy-registry.ts tests/core/utils/field-strategy-registry.test.ts
git commit -m "feat: central field-strategy registry for refine dispatch"
```

---

## Phase 4 — Effects, handlers, generation request type

### Task 12: Add `chatRequest` payload + UI action types

**Files:**
- Modify: `src/core/store/slices/ui.ts` (add new UI action creators below)
- Modify: `src/core/store/types.ts` (extend `GenerationRequest.type` and `GenerationStrategy.target`)

- [ ] **Step 1: Add UI action creators to `src/core/store/slices/ui.ts`**

Append new actions in the same pattern used by existing UI actions (e.g. `uiBrainstormSubmitUserMessage`):

```ts
// src/core/store/slices/ui.ts (additions only)

export const uiChatSubmitUserMessage = createAction<{ chatId: string }>(
  "ui/chat/submit-user-message",
);
export const uiChatRetryGeneration = createAction<{ chatId: string; messageId: string }>(
  "ui/chat/retry-generation",
);
export const uiChatSummarizeRequested = createAction<{
  seed:
    | { kind: "fromChat"; sourceChatId: string }
    | { kind: "fromStoryText"; sourceText: string };
}>("ui/chat/summarize-requested");
export const uiChatRefineRequested = createAction<{
  fieldId: string;
  sourceText: string;
}>("ui/chat/refine-requested");
export const uiChatRefineCommitted = createAction<Record<string, never>>(
  "ui/chat/refine-committed",
);
export const uiChatRefineDiscarded = createAction<Record<string, never>>(
  "ui/chat/refine-discarded",
);
```

- [ ] **Step 2: Extend `GenerationRequest.type` and `GenerationStrategy.target`**

Edit `src/core/store/types.ts`:

```ts
// Inside GenerationRequest.type union, add:
| "chat"
| "chatRefine"

// Inside GenerationStrategy.target union, add:
| { type: "chat"; chatId: string; messageId: string }
| { type: "chatRefine"; messageId: string; fieldId: string }
```

Keep the old `brainstorm` / `lorebookRefine` entries for now; they're removed in Phase 7.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/core/store/slices/ui.ts src/core/store/types.ts
git commit -m "feat: chat ui action creators and chat/chatRefine request types"
```

---

### Task 13: Implement `chat-effects.ts`

**Files:**
- Create: `src/core/store/effects/chat-effects.ts`
- Test: `tests/core/store/effects/chat-effects.test.ts`

- [ ] **Step 1: Failing test for the refine submit path**

```ts
// tests/core/store/effects/chat-effects.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createStore } from "nai-store";
import { rootReducerForTest } from "../../helpers/store-helpers"; // see Step 2

// Tests focus on contract-level behavior: the right actions get dispatched
// when UI actions fire. Full integration coverage lives in chat.test.ts.

describe("chat-effects: refine submit", () => {
  beforeEach(() => {
    (globalThis as any).api = {
      v1: {
        uuid: () => "uuid-" + Math.random().toString(36).slice(2),
        ui: { toast: vi.fn() },
        config: { get: vi.fn().mockResolvedValue("glm-4-6") },
        storyStorage: { get: vi.fn(), set: vi.fn() },
      },
    };
  });

  it("uiChatRefineRequested with empty source toasts and bails", async () => {
    const { dispatchAndWait, getState, toast } = makeHarness();
    await dispatchAndWait({ type: "ui/chat/refine-requested", payload: { fieldId: "intent", sourceText: "  " } });
    expect(toast).toHaveBeenCalledWith(expect.stringMatching(/empty/i), expect.any(Object));
    expect(getState().chat.refineChat).toBeNull();
  });

  it("uiChatRefineRequested while refineChat already set toasts and bails", async () => {
    const { dispatchAndWait, getState, toast, openInitialRefine } = makeHarness();
    openInitialRefine();
    expect(getState().chat.refineChat).not.toBeNull();
    await dispatchAndWait({
      type: "ui/chat/refine-requested",
      payload: { fieldId: "attg", sourceText: "x" },
    });
    expect(toast).toHaveBeenCalledWith(expect.stringMatching(/finish or discard/i), expect.any(Object));
  });

  it("uiChatRefineRequested with valid input opens the refine slot", async () => {
    const { dispatchAndWait, getState } = makeHarness();
    await dispatchAndWait({
      type: "ui/chat/refine-requested",
      payload: { fieldId: "intent", sourceText: "old text" },
    });
    expect(getState().chat.refineChat?.refineTarget?.fieldId).toBe("intent");
    expect(getState().chat.refineChat?.refineTarget?.originalText).toBe("old text");
  });
});

// makeHarness omitted here for brevity — implement under tests/core/store/helpers/.
```

- [ ] **Step 2: Add a tiny test harness**

Create `tests/core/store/helpers/store-helpers.ts` (only used by this test):

```ts
// tests/core/store/helpers/store-helpers.ts
import { createStore, combineReducers, type Action } from "nai-store";
import { chatSlice } from "../../../../src/core/store/slices/chat";
import { uiSlice } from "../../../../src/core/store/slices/ui";
import { runtimeSlice } from "../../../../src/core/store/slices/runtime";

export const rootReducerForTest = combineReducers({
  chat: chatSlice.reducer,
  ui: uiSlice.reducer,
  runtime: runtimeSlice.reducer,
});

export function makeTestStore() {
  return createStore(rootReducerForTest as any, false);
}
```

If your harness needs more slices to register chat-effects without crashes, include them here as well.

- [ ] **Step 3: Implement `chat-effects.ts`**

```ts
// src/core/store/effects/chat-effects.ts
import { Store, matchesAction } from "nai-store";
import type { RootState, AppDispatch } from "../types";
import {
  uiChatSubmitUserMessage,
  uiChatRetryGeneration,
  uiChatSummarizeRequested,
  uiChatRefineRequested,
  uiChatRefineCommitted,
  uiChatRefineDiscarded,
} from "../slices/ui";
import {
  chatCreated,
  chatRenamed,
  messageAdded,
  messagesPrunedAfter,
  refineChatOpened,
  refineChatCleared,
  refineMessageAdded,
} from "../slices/chat";
import {
  generationSubmitted,
  requestQueued,
  uiCancelRequest,
} from "../index";
import { getChatTypeSpec } from "../../chat-types";
import type { Chat, ChatMessage, RefineContext } from "../../chat-types/types";
import { getFieldStrategy } from "../../utils/field-strategy-registry";
import { buildModelParams } from "../../utils/config";
import { flushActiveEditor } from "../../../ui/framework/editable-draft";
import { IDS } from "../../../ui/framework/ids";

function findChat(state: RootState, id: string): Chat | undefined {
  return state.chat.chats.find((c) => c.id === id);
}

async function submitChatGeneration(
  state: RootState,
  dispatch: AppDispatch,
  chat: Chat,
  assistantId: string,
): Promise<void> {
  // Strategy assembly will be added in Task 13b/Task 14 once the chat
  // generation strategy factory is in place. For now, route to the existing
  // brainstorm strategy when chat is brainstorm-typed; new strategy types
  // wire in during Phase 7.
  // ...
  // (Detailed implementation continues; see chat-effects skeleton below.)
}

export function registerChatEffects(
  subscribeEffect: Store<RootState>["subscribeEffect"],
  dispatch: AppDispatch,
  getState: () => RootState,
): void {
  // ── Submit new user message ─────────────────────────────────────────
  subscribeEffect(matchesAction(uiChatSubmitUserMessage), async (action, { getState: latest }) => {
    await flushActiveEditor();
    const { chatId } = action.payload;
    const inputKey = IDS.BRAINSTORM.INPUT;
    const text = ((await api.v1.storyStorage.get(inputKey)) as string) || "";
    await api.v1.storyStorage.set(inputKey, "");
    api.v1.ui.updateParts([{ id: IDS.BRAINSTORM.INPUT, value: "" }]);

    if (text.trim()) {
      dispatch(
        messageAdded({
          chatId,
          message: { id: api.v1.uuid(), role: "user", content: text },
        }),
      );
    }
    const chat = findChat(latest(), chatId);
    if (!chat || chat.messages.at(-1)?.role !== "user") return;

    const assistantId = api.v1.uuid();
    dispatch(messageAdded({ chatId, message: { id: assistantId, role: "assistant", content: "" } }));
    await submitChatGeneration(latest(), dispatch, chat, assistantId);
  });

  // ── Retry ────────────────────────────────────────────────────────────
  subscribeEffect(matchesAction(uiChatRetryGeneration), async (action, { getState: latest }) => {
    const { chatId, messageId } = action.payload;
    dispatch(messagesPrunedAfter({ chatId, id: messageId }));
    const chat = findChat(latest(), chatId);
    if (!chat) return;
    const assistantId = api.v1.uuid();
    dispatch(messageAdded({ chatId, message: { id: assistantId, role: "assistant", content: "" } }));
    await submitChatGeneration(latest(), dispatch, chat, assistantId);
  });

  // ── Summarize ────────────────────────────────────────────────────────
  subscribeEffect(matchesAction(uiChatSummarizeRequested), async (action, { getState: latest }) => {
    const spec = getChatTypeSpec("summary");
    const init = spec.initialize(action.payload.seed, { getState: latest, dispatch });
    const newChat: Chat = {
      id: api.v1.uuid(),
      type: "summary",
      title: init.title,
      messages: init.initialMessages,
      seed: action.payload.seed as Chat["seed"],
    };
    dispatch(chatCreated({ chat: newChat }));
    const assistantId = api.v1.uuid();
    dispatch(
      messageAdded({
        chatId: newChat.id,
        message: { id: assistantId, role: "assistant", content: "" },
      }),
    );
    await submitChatGeneration(latest(), dispatch, newChat, assistantId);
  });

  // ── Refine: open ─────────────────────────────────────────────────────
  subscribeEffect(matchesAction(uiChatRefineRequested), async (action, { getState: latest }) => {
    const { fieldId, sourceText } = action.payload;
    if (!sourceText.trim()) {
      api.v1.ui.toast("Nothing to refine — field is empty.", { type: "info" });
      return;
    }
    if (latest().chat.refineChat) {
      api.v1.ui.toast("Finish or discard the current refine first.", { type: "warning" });
      return;
    }
    const spec = getChatTypeSpec("refine");
    const seed = { kind: "fromField", sourceFieldId: fieldId, sourceText } as const;
    const init = spec.initialize(seed, { getState: latest, dispatch });
    const refine: Chat = {
      id: api.v1.uuid(),
      type: "refine",
      title: init.title,
      messages: init.initialMessages,
      seed,
      refineTarget: { fieldId, originalText: sourceText },
    };
    dispatch(refineChatOpened({ chat: refine }));
    // Sidebar auto-open is handled by the UI layer reacting to refineChat presence.
  });

  // ── Refine: discard ──────────────────────────────────────────────────
  subscribeEffect(matchesAction(uiChatRefineDiscarded), async (_action, { getState: latest }) => {
    const refine = latest().chat.refineChat;
    if (!refine) return;
    // Cancel any in-flight refine request belonging to this chat.
    const inflightId = latest().runtime.activeRequest?.id;
    if (inflightId && inflightId.startsWith(`refine-${refine.id}`)) {
      dispatch(uiCancelRequest({ requestId: inflightId }));
    }
    dispatch(refineChatCleared());
  });

  // ── Refine: commit ───────────────────────────────────────────────────
  subscribeEffect(matchesAction(uiChatRefineCommitted), async (_action, { getState: latest }) => {
    const refine = latest().chat.refineChat;
    if (!refine?.refineTarget) return;
    const lastCandidate = [...refine.messages]
      .reverse()
      .find((m) => m.role === "assistant" && m.content.trim().length > 0);
    if (!lastCandidate) return; // no-op when no candidate yet

    // Hand off to the spec's onCommit which writes back to the field.
    const spec = getChatTypeSpec("refine");
    spec.onCommit?.(refine, { getState: latest, dispatch });
    dispatch(refineChatCleared());
  });
}
```

The actual write-back (refine-spec `onCommit`) belongs in the refine spec; update `src/core/chat-types/refine.ts` to add an `onCommit` that dispatches the field's set-action via a small per-field action map. See Task 14 for the wiring.

- [ ] **Step 4: Run tests**

Run: `npm run test -- tests/core/store/effects/chat-effects.test.ts`

If tests reference `submitChatGeneration` paths that aren't implemented yet, comment those tests with a `it.todo(...)` line and revisit them in Task 14.

- [ ] **Step 5: Commit**

```bash
git add src/core/store/effects/chat-effects.ts tests/core/store/effects/chat-effects.test.ts tests/core/store/helpers/store-helpers.ts
git commit -m "feat: chat-effects skeleton with refine open/commit/discard"
```

---

### Task 14: Implement chat generation submission + refine commit write-back

This task fills in `submitChatGeneration` and the refine spec's `onCommit` so that pressing Send (or Commit) actually fires a request.

**Files:**
- Modify: `src/core/store/effects/chat-effects.ts`
- Modify: `src/core/chat-types/refine.ts`
- Create: `src/core/utils/chat-strategy.ts`
- Test: `tests/core/utils/chat-strategy.test.ts`

- [ ] **Step 1: Failing test for chat-strategy**

```ts
// tests/core/utils/chat-strategy.test.ts
import { describe, it, expect, vi } from "vitest";
import { buildChatStrategy } from "../../../src/core/utils/chat-strategy";
import type { Chat } from "../../../src/core/chat-types/types";

describe("buildChatStrategy", () => {
  it("returns a strategy with chat target type", () => {
    const chat: Chat = {
      id: "c1",
      type: "brainstorm",
      title: "x",
      subMode: "cowriter",
      messages: [{ id: "u", role: "user", content: "hi" }],
      seed: { kind: "blank" },
    };
    const getState = () =>
      ({
        chat: { chats: [chat], activeChatId: chat.id, refineChat: null },
      }) as unknown as ReturnType<Parameters<typeof buildChatStrategy>[0]>;
    const strategy = buildChatStrategy(getState, chat, "asst-id");
    expect(strategy.target).toEqual({ type: "chat", chatId: chat.id, messageId: "asst-id" });
    expect(strategy.requestId).toContain(chat.id);
  });

  it("returns a chatRefine target when refineChat is set", () => {
    const refine: Chat = {
      id: "r1",
      type: "refine",
      title: "Refine",
      messages: [],
      seed: { kind: "fromField", sourceFieldId: "intent", sourceText: "old" },
      refineTarget: { fieldId: "intent", originalText: "old" },
    };
    const getState = () =>
      ({
        chat: { chats: [], activeChatId: null, refineChat: refine },
      }) as unknown as ReturnType<Parameters<typeof buildChatStrategy>[0]>;
    const strategy = buildChatStrategy(getState, refine, "asst");
    expect(strategy.target).toEqual({ type: "chatRefine", messageId: "asst", fieldId: "intent" });
  });
});
```

- [ ] **Step 2: Run, expect failure**

- [ ] **Step 3: Implement `chat-strategy.ts`**

```ts
// src/core/utils/chat-strategy.ts
import type { Chat } from "../chat-types/types";
import type { GenerationStrategy, RootState } from "../store/types";
import { getChatTypeSpec } from "../chat-types";
import { getFieldStrategy } from "./field-strategy-registry";
import { buildModelParams } from "./config";
import { buildStoryEnginePrefix } from "./context-builder";

export function buildChatStrategy(
  getState: () => RootState,
  chat: Chat,
  assistantMessageId: string,
): GenerationStrategy {
  if (chat.type === "refine" && chat.refineTarget) {
    const factory = getFieldStrategy(chat.refineTarget.fieldId);
    const inner = factory(getState, {
      refineContext: {
        fieldId: chat.refineTarget.fieldId,
        currentText: chat.refineTarget.originalText,
        history: chat.messages,
      },
    });
    // Re-target the inner strategy at the refine chat
    return {
      ...inner,
      requestId: `refine-${chat.id}-${assistantMessageId}`,
      target: {
        type: "chatRefine",
        messageId: assistantMessageId,
        fieldId: chat.refineTarget.fieldId,
      },
    };
  }

  // Saved chat (brainstorm/summary): SE prefix + spec system prompt + transcript
  const spec = getChatTypeSpec(chat.type);
  const ctx = { getState, dispatch: () => {} };
  return {
    requestId: `chat-${chat.id}-${assistantMessageId}`,
    messageFactory: () => {
      const prefix = buildStoryEnginePrefix(getState, { excludeChat: true });
      const system = spec.systemPromptFor(chat, ctx);
      const transcript = chat.messages
        .filter((m) => m.id !== assistantMessageId)
        .map((m) => ({ role: m.role, content: m.content }));
      return [...prefix, { role: "system", content: system }, ...transcript];
    },
    params: undefined,
    target: { type: "chat", chatId: chat.id, messageId: assistantMessageId },
    prefillBehavior: "trim",
    assistantPrefill: spec.prefillFor?.(chat, ctx),
  };
}
```

`buildStoryEnginePrefix` will gain an `excludeChat` option in Phase 5; for now, this keeps the call site future-friendly. If the option doesn't exist yet, use `buildStoryEnginePrefix(getState, opts)` with the existing options object and let Phase 5 patch the prefix to consult specs.

- [ ] **Step 4: Wire into `chat-effects.ts`**

Replace the placeholder `submitChatGeneration` in `chat-effects.ts` with:

```ts
async function submitChatGeneration(
  _state: RootState,
  dispatch: AppDispatch,
  chat: Chat,
  assistantId: string,
): Promise<void> {
  const strategy = buildChatStrategy(() => _state, chat, assistantId);
  const params = await buildModelParams({ max_tokens: 1024, temperature: 1.0 });
  dispatch(
    requestQueued({
      id: strategy.requestId,
      type: chat.type === "refine" ? "chatRefine" : "chat",
      targetId: assistantId,
    }),
  );
  dispatch(generationSubmitted({ ...strategy, params }));
}
```

- [ ] **Step 5: Add refine `onCommit`**

Edit `src/core/chat-types/refine.ts` and add an `onCommit` that dispatches the appropriate field set-action. The action mapping is field-specific; here we centralize it in a small map:

```ts
// src/core/chat-types/refine.ts (additions)
import {
  foundationFieldSet,
  // ...other field setters; check src/core/store/slices/foundation.ts for exact names
} from "../store/slices/foundation";

const FIELD_COMMIT_DISPATCHERS: Record<string, (text: string, ctx: SpecCtx) => void> = {
  intent: (text, { dispatch }) => dispatch(foundationFieldSet({ field: "intent", value: text })),
  attg: (text, { dispatch }) => dispatch(foundationFieldSet({ field: "attg", value: text })),
  style: (text, { dispatch }) => dispatch(foundationFieldSet({ field: "style", value: text })),
  contractRequired: (text, { dispatch }) =>
    dispatch(foundationFieldSet({ field: "contractRequired", value: text })),
  contractProhibited: (text, { dispatch }) =>
    dispatch(foundationFieldSet({ field: "contractProhibited", value: text })),
  contractEmphasis: (text, { dispatch }) =>
    dispatch(foundationFieldSet({ field: "contractEmphasis", value: text })),
  lorebookContent: async (text, { getState }) => {
    const refine = getState().chat.refineChat;
    const entryId = refine?.refineTarget && (refine.seed as { entryId?: string }).entryId;
    if (entryId) await api.v1.lorebook.updateEntry(entryId, { text });
  },
  lorebookKeys: async (text, { getState }) => {
    const refine = getState().chat.refineChat;
    const entryId = refine?.refineTarget && (refine.seed as { entryId?: string }).entryId;
    const keys = text.split(",").map((k) => k.trim()).filter(Boolean);
    if (entryId) await api.v1.lorebook.updateEntry(entryId, { keys });
  },
};

refineSpec.onCommit = (chat, ctx) => {
  if (!chat.refineTarget) return;
  const lastCandidate = [...chat.messages]
    .reverse()
    .find((m) => m.role === "assistant" && m.content.trim().length > 0);
  if (!lastCandidate) return;
  const dispatcher = FIELD_COMMIT_DISPATCHERS[chat.refineTarget.fieldId];
  if (!dispatcher) {
    api.v1.ui.toast(`Refine commit not supported for: ${chat.refineTarget.fieldId}`, {
      type: "warning",
    });
    return;
  }
  dispatcher(lastCandidate.content, ctx);
};
```

The exact `foundationFieldSet` name and shape must match what's in `src/core/store/slices/foundation.ts`. Confirm with `grep -n "foundationFieldSet\|export const.*foundation" src/core/store/slices/foundation.ts`. If the slice uses per-field actions (e.g. `intentSet`, `attgSet`), wire each accordingly.

For lorebook fields, the refine seed must additionally carry `entryId`. Update the refine open path in `chat-effects.ts` to accept an optional `entryId` field on `uiChatRefineRequested.payload`, store it in `chat.seed`, and read it back in the dispatcher.

- [ ] **Step 6: Run all chat-related tests**

Run: `npm run test -- tests/core/store/effects/chat-effects.test.ts tests/core/chat-types tests/core/utils/chat-strategy.test.ts tests/core/utils/refine-strategy.test.ts`
Expected: green.

- [ ] **Step 7: Commit**

```bash
git add src/core/utils/chat-strategy.ts src/core/store/effects/chat-effects.ts src/core/chat-types/refine.ts tests/core/utils/chat-strategy.test.ts
git commit -m "feat: chat strategy + refine onCommit field write-back"
```

---

### Task 15: Add `chat` and `chatRefine` completion handlers

**Files:**
- Create: `src/core/store/effects/handlers/chat.ts`
- Modify: `src/core/store/effects/generation-handlers.ts` (or whichever file routes targets to handlers — confirm with `grep`)

- [ ] **Step 1: Locate the existing handler dispatcher**

Run: `grep -n "target.type === \"brainstorm\"\|case \"brainstorm\":" src/core/store/effects/generation-handlers.ts`

This shows where `brainstorm` target completions are routed. Follow the same pattern for `chat` and `chatRefine`.

- [ ] **Step 2: Create `handlers/chat.ts`**

```ts
// src/core/store/effects/handlers/chat.ts
import type { AppDispatch, RootState } from "../../types";
import {
  messageUpdated,
  messageAppended,
  refineMessageAdded,
  refineMessageAppended,
  refineCandidateMarked,
} from "../../slices/chat";
import { stripThinkingTags } from "../../../utils/filters"; // verify filename

export function handleChatChunk(
  dispatch: AppDispatch,
  target: { type: "chat"; chatId: string; messageId: string },
  delta: string,
): void {
  dispatch(messageAppended({ chatId: target.chatId, id: target.messageId, content: delta }));
}

export function handleChatComplete(
  dispatch: AppDispatch,
  getState: () => RootState,
  target: { type: "chat"; chatId: string; messageId: string },
  fullText: string,
): void {
  const cleaned = stripThinkingTags(fullText);
  dispatch(messageUpdated({ chatId: target.chatId, id: target.messageId, content: cleaned }));
}

export function handleChatRefineChunk(
  dispatch: AppDispatch,
  target: { type: "chatRefine"; messageId: string },
  delta: string,
): void {
  // Ensure the assistant message exists in the refine slot
  // The first chunk should have caused a refineMessageAdded — handlers run after
  // chat-effects appends an empty assistant message at submit time.
  dispatch(refineMessageAppended({ id: target.messageId, content: delta }));
}

export function handleChatRefineComplete(
  dispatch: AppDispatch,
  _getState: () => RootState,
  target: { type: "chatRefine"; messageId: string },
  fullText: string,
): void {
  const cleaned = stripThinkingTags(fullText);
  dispatch(refineMessageAppended({ id: target.messageId, content: "" })); // no-op anchor
  dispatch(refineCandidateMarked({ messageId: target.messageId }));
  // Replace any partial content with the cleaned version using a final messageUpdated-like call.
  // The slice exposes refineMessageAppended; for full replacement we add a new action in chat slice
  // if needed. For now, use stripThinkingTags only at the start of the chunk path.
}
```

If your slice currently lacks a `refineMessageReplaced` action, add it now to the chat slice:

```ts
// in chatSlice.reducers (slices/chat.ts)
refineMessageReplaced: (state, payload: { id: string; content: string }) => {
  if (!state.refineChat) return state;
  return {
    ...state,
    refineChat: {
      ...state.refineChat,
      messages: state.refineChat.messages.map((m) =>
        m.id === payload.id ? { ...m, content: payload.content } : m,
      ),
    },
  };
},
```

Then update `handleChatRefineComplete` to dispatch `refineMessageReplaced({ id: target.messageId, content: cleaned })`.

- [ ] **Step 3: Wire the handlers into `generation-handlers.ts`**

Find the `target.type` switch (or equivalent dispatcher pattern). Add:

```ts
case "chat":
  handleChatChunk(dispatch, target, delta);
  // ... and handleChatComplete in the completion path
  break;
case "chatRefine":
  handleChatRefineChunk(dispatch, target, delta);
  // ... and handleChatRefineComplete
  break;
```

Match the existing surrounding pattern exactly — the handler file usually has separate streaming and completion entry points.

- [ ] **Step 4: Run the suite**

Run: `npm run test`
Expected: green. New handlers are exercised once Phase 6 mounts the UI; for now they compile and dispatch correctly.

- [ ] **Step 5: Commit**

```bash
git add src/core/store/effects/handlers/chat.ts src/core/store/effects/generation-handlers.ts src/core/store/slices/chat.ts
git commit -m "feat: chat + chatRefine generation handlers"
```

---

### Task 16: Register chat-effects in `register-effects.ts`

The new effect coexists with the old `registerBrainstormEffects` for now. The UI still talks to brainstorm effects until Phase 6 swaps the panel. Tests added in earlier tasks already exercise the new effect in isolation.

**Files:**
- Modify: `src/core/store/register-effects.ts`

- [ ] **Step 1: Add the import + registration**

```ts
// near the top
import { registerChatEffects } from "./effects/chat-effects";

// inside registerEffects(), alongside registerBrainstormEffects:
registerChatEffects(subscribeEffect, dispatch, getState);
```

- [ ] **Step 2: Run the suite**

Run: `npm run test`
Expected: green.

- [ ] **Step 3: Commit**

```bash
git add src/core/store/register-effects.ts
git commit -m "feat: register chat-effects alongside brainstorm-effects"
```

---

## Phase 5 — Context-builder rewire

### Task 17: Make `buildStoryEnginePrefix` consult chat-type spec for active-chat injection

Currently the prefix reads `state.brainstorm` directly. After this task, it reads `state.chat.activeChatId`, looks up the spec, and calls `contextSlice` to project messages. The brainstorm slice path is left as a fallback for any persisted-only-state scenario (during the transition window where Tasks 17-19 run before 22).

**Files:**
- Modify: `src/core/utils/context-builder.ts`
- Test: `tests/core/utils/context-builder.test.ts` (new or extend existing)

- [ ] **Step 1: Identify the brainstorm-injection block**

Run: `grep -nC 3 "state.brainstorm\|currentChat\|currentMessages" src/core/utils/context-builder.ts`

Note the exact lines that build the brainstorm-context section of MSG 2 in `buildStoryEnginePrefix`. Replace them by consulting the chat slice + spec.

- [ ] **Step 2: Failing test**

```ts
// tests/core/utils/context-builder.test.ts (extend if file exists)
import { describe, it, expect } from "vitest";
import { buildStoryEnginePrefix } from "../../../src/core/utils/context-builder";

describe("buildStoryEnginePrefix — chat slice integration", () => {
  it("uses contextSlice from active chat's spec", () => {
    const getState = () =>
      ({
        story: { fields: {}, attgEnabled: false, styleEnabled: false },
        foundation: { /* minimal */ } as any,
        world: { groups: [], entitiesById: {}, entityIds: [], forgeLoopActive: false },
        runtime: { /* minimal */ } as any,
        ui: { /* minimal */ } as any,
        brainstorm: { chats: [], currentChatIndex: 0 } as any,
        chat: {
          chats: [
            {
              id: "c1",
              type: "brainstorm",
              title: "x",
              subMode: "cowriter",
              messages: [{ id: "u", role: "user", content: "PROBE_TOKEN_42" }],
              seed: { kind: "blank" },
            },
          ],
          activeChatId: "c1",
          refineChat: null,
        },
      }) as any;
    const prefix = buildStoryEnginePrefix(getState, {});
    const concatenated = prefix.map((m) => m.content).join("\n");
    expect(concatenated).toContain("PROBE_TOKEN_42");
  });
});
```

- [ ] **Step 3: Run, expect failure**

(If the prefix already happens to inject brainstorm transcripts, the test may pass for the wrong reason. Make the probe token unmistakable.)

- [ ] **Step 4: Implement**

Find the existing brainstorm-injection point in `buildStoryEnginePrefix`. Replace the lookup:

```ts
// before
const messages = currentMessages(state.brainstorm);

// after
import { activeSavedChat } from "../store/slices/chat";
import { getChatTypeSpec } from "../chat-types";

const active = activeSavedChat(state.chat);
const messages = active
  ? getChatTypeSpec(active.type).contextSlice(active, { getState, dispatch: () => {} })
  : [];
```

Add an optional `excludeChat` knob to the existing options object so chat-strategy can skip this section when constructing its own request:

```ts
export function buildStoryEnginePrefix(
  getState: () => RootState,
  opts: { excludeChat?: boolean; /* existing opts */ },
): Message[] {
  // ...
  if (!opts.excludeChat) {
    // injection logic above
  }
  // ...
}
```

- [ ] **Step 5: Run tests**

Run: `npm run test -- tests/core/utils/context-builder.test.ts`
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add src/core/utils/context-builder.ts tests/core/utils/context-builder.test.ts
git commit -m "refactor: buildStoryEnginePrefix consults chat-type spec for active chat"
```

---

## Phase 6 — UI components

### Task 18: `SeGenRefinePair`

**Files:**
- Create: `src/ui/components/SeGenRefinePair.ts`

- [ ] **Step 1: Confirm the icon names available**

Run: `grep -nE "type IconId|IconId =" external/script-types.d.ts | head`

Pick `zap` (already used for generate) and an `edit-*` glyph (`edit-2` or `edit-3`) for refine — whichever the IconId enum exposes. Use the actual name in the implementation below.

- [ ] **Step 2: Implement**

```ts
// src/ui/components/SeGenRefinePair.ts
import { SuiComponent, type SuiComponentOptions } from "nai-simple-ui";
import { store } from "../../core/store";
import { uiChatRefineRequested } from "../../core/store/slices/ui";
import { SeGenerationIconButton } from "./SeGenerationButton";

type Theme = { default: { self: { style: object } } };
type State = Record<string, never>;

export type SeGenRefinePairOptions = {
  fieldId: string;
  generateRequestId?: string;
  generateAction?: { type: string; payload?: unknown };
  onGenerate?: () => void;
  /** Called at click time to source the current field text. */
  refineSourceText: () => string;
  hasContent?: boolean;
  contentChecker?: () => Promise<boolean>;
} & SuiComponentOptions<Theme, State>;

export class SeGenRefinePair extends SuiComponent<
  Theme,
  State,
  SeGenRefinePairOptions,
  UIPartRow
> {
  private readonly _gen: SeGenerationIconButton;

  constructor(options: SeGenRefinePairOptions) {
    super({ state: {} as State, ...options }, { default: { self: { style: {} } } });
    this._gen = new SeGenerationIconButton({
      id: `${options.id}-gen`,
      iconId: "zap" as IconId,
      requestId: options.generateRequestId,
      generateAction: options.generateAction,
      onGenerate: options.onGenerate,
      hasContent: options.hasContent,
      contentChecker: options.contentChecker,
    });
  }

  async compose(): Promise<UIPartRow> {
    const { row, button } = api.v1.ui.part;
    const genPart = await this._gen.build();

    return row({
      id: this.id,
      style: { gap: "4px", "align-items": "center" },
      content: [
        genPart,
        button({
          id: `${this.id}-refine`,
          iconId: "edit-2" as IconId,
          style: { background: "none", border: "none", padding: "6px 8px", margin: "0", opacity: "1", cursor: "pointer" },
          callback: () => this._handleRefineClick(),
        }),
      ],
    });
  }

  private _handleRefineClick(): void {
    const sourceText = this.options.refineSourceText().trim();
    if (!sourceText) {
      api.v1.ui.toast("Nothing to refine — field is empty.", { type: "info" });
      return;
    }
    store.dispatch(
      uiChatRefineRequested({ fieldId: this.options.fieldId, sourceText }),
    );
  }
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/ui/components/SeGenRefinePair.ts
git commit -m "feat: SeGenRefinePair drop-in [generate | refine] icon pair"
```

---

### Task 19: `RefineCommitBar`

**Files:**
- Create: `src/ui/components/RefineCommitBar.ts`

- [ ] **Step 1: Implement**

```ts
// src/ui/components/RefineCommitBar.ts
import { SuiComponent, type SuiComponentOptions } from "nai-simple-ui";
import { store } from "../../core/store";
import {
  uiChatRefineCommitted,
  uiChatRefineDiscarded,
} from "../../core/store/slices/ui";
import { StoreWatcher } from "../store-watcher";
import type { RootState } from "../../core/store/types";

type Theme = { default: { self: { style: object } } };
type State = { commitEnabled: boolean };

export type RefineCommitBarOptions = SuiComponentOptions<Theme, State>;

function hasCandidate(state: RootState): boolean {
  const refine = state.chat.refineChat;
  if (!refine) return false;
  return refine.messages.some(
    (m) => m.role === "assistant" && m.content.trim().length > 0,
  );
}

export class RefineCommitBar extends SuiComponent<Theme, State, RefineCommitBarOptions, UIPartRow> {
  private readonly _watcher: StoreWatcher;

  constructor(options: RefineCommitBarOptions) {
    super(
      { state: { commitEnabled: hasCandidate(store.getState()) }, ...options },
      { default: { self: { style: {} } } },
    );
    this._watcher = new StoreWatcher();
  }

  async compose(): Promise<UIPartRow> {
    this._watcher.dispose();
    this._watcher.watch(
      (s: RootState) => hasCandidate(s),
      (enabled: boolean) => {
        if (enabled !== this.state.commitEnabled) {
          void this.setState({ commitEnabled: enabled });
        }
      },
    );

    const { row, button } = api.v1.ui.part;
    return row({
      id: this.id,
      style: { gap: "8px", "margin-top": "8px" },
      content: [
        button({
          id: `${this.id}-commit`,
          text: "Commit",
          style: {
            flex: "1",
            "font-weight": "bold",
            opacity: this.state.commitEnabled ? "1" : "0.5",
            cursor: this.state.commitEnabled ? "pointer" : "default",
          },
          callback: this.state.commitEnabled
            ? () => store.dispatch(uiChatRefineCommitted({}))
            : undefined,
        }),
        button({
          id: `${this.id}-discard`,
          text: "Discard",
          style: { flex: "1" },
          callback: () => store.dispatch(uiChatRefineDiscarded({})),
        }),
      ],
    });
  }

  override async onSync(): Promise<void> {
    api.v1.ui.updateParts([
      {
        id: `${this.id}-commit`,
        style: {
          flex: "1",
          "font-weight": "bold",
          opacity: this.state.commitEnabled ? "1" : "0.5",
          cursor: this.state.commitEnabled ? "pointer" : "default",
        },
        callback: this.state.commitEnabled
          ? () => store.dispatch(uiChatRefineCommitted({}))
          : undefined,
      },
    ]);
  }
}
```

- [ ] **Step 2: Type-check + commit**

Run: `npx tsc --noEmit -p tsconfig.json`

```bash
git add src/ui/components/RefineCommitBar.ts
git commit -m "feat: RefineCommitBar with reactive commit-enabled state"
```

---

### Task 20: `ChatHeader`

**Files:**
- Create: `src/ui/components/ChatHeader.ts`

- [ ] **Step 1: Implement**

```ts
// src/ui/components/ChatHeader.ts
import { SuiComponent, type SuiComponentOptions } from "nai-simple-ui";
import { store } from "../../core/store";
import { getChatTypeSpec } from "../../core/chat-types";
import { uiChatSummarizeRequested } from "../../core/store/slices/ui";
import { subModeChanged } from "../../core/store/slices/chat";
import { StoreWatcher } from "../store-watcher";
import type { Chat } from "../../core/chat-types/types";

type Theme = { default: { self: { style: object } } };
type State = Record<string, never>;

export type ChatHeaderOptions = {
  /** Resolves the chat to render the header for; called at compose time. */
  chatProvider: () => Chat | null;
  onOpenSessions?: () => void;
} & SuiComponentOptions<Theme, State>;

export class ChatHeader extends SuiComponent<Theme, State, ChatHeaderOptions, UIPartRow> {
  private readonly _watcher: StoreWatcher;

  constructor(options: ChatHeaderOptions) {
    super({ state: {} as State, ...options }, { default: { self: { style: {} } } });
    this._watcher = new StoreWatcher();
  }

  async compose(): Promise<UIPartRow> {
    this._watcher.dispose();
    const chat = this.options.chatProvider();
    const { row, button, text } = api.v1.ui.part;
    if (!chat) return row({ id: this.id, content: [] });

    const spec = getChatTypeSpec(chat.type);
    const controls = spec.headerControls(chat, { getState: store.getState, dispatch: store.dispatch });
    const built = controls.map((c) => {
      switch (c.kind) {
        case "sessionsButton":
          return button({
            id: `${this.id}-sessions`,
            iconId: "folder" as IconId,
            callback: () => this.options.onOpenSessions?.(),
          });
        case "subModeToggle":
          return button({
            id: `${this.id}-submode`,
            text: chat.subMode === "critic" ? "Crit" : "Co",
            callback: () =>
              store.dispatch(
                subModeChanged({
                  id: chat.id,
                  subMode: chat.subMode === "critic" ? "cowriter" : "critic",
                }),
              ),
          });
        case "summarizeButton":
          return button({
            id: `${this.id}-sum`,
            text: "Sum",
            callback: () =>
              store.dispatch(
                uiChatSummarizeRequested({
                  seed: { kind: "fromChat", sourceChatId: chat.id },
                }),
              ),
          });
        case "label":
          return text({ id: `${this.id}-label`, text: chat.title });
        default:
          return text({ id: `${this.id}-x-${c.id}`, text: "" });
      }
    });

    return row({
      id: this.id,
      style: { gap: "6px", "align-items": "center", padding: "6px" },
      content: built,
    });
  }
}
```

- [ ] **Step 2: Type-check + commit**

```bash
npx tsc --noEmit -p tsconfig.json
git add src/ui/components/ChatHeader.ts
git commit -m "feat: ChatHeader renders spec-defined controls"
```

---

### Task 21: `ChatPanel` (replaces `BrainstormPane`)

**Files:**
- Create: `src/ui/components/ChatPanel.ts`

- [ ] **Step 1: Implement**

```ts
// src/ui/components/ChatPanel.ts
import { SuiComponent, type SuiComponentOptions } from "nai-simple-ui";
import { store } from "../../core/store";
import { StoreWatcher } from "../store-watcher";
import type { RootState } from "../../core/store/types";
import { ChatHeader } from "./ChatHeader";
import { SeBrainstormInput } from "./SeBrainstormInput";
import { SeMessage } from "./SeMessage";
import { RefineCommitBar } from "./RefineCommitBar";
import type { Chat } from "../../core/chat-types/types";

type Theme = { default: { self: { style: object } } };
type State = Record<string, never>;

export type ChatPanelOptions = {
  onRebuild: () => void;
  onOpenSessions: () => void;
} & SuiComponentOptions<Theme, State>;

function visibleChat(state: RootState): Chat | null {
  if (state.chat.refineChat) return state.chat.refineChat;
  if (!state.chat.activeChatId) return null;
  return state.chat.chats.find((c) => c.id === state.chat.activeChatId) ?? null;
}

export class ChatPanel extends SuiComponent<Theme, State, ChatPanelOptions, UIPartColumn> {
  private readonly _watcher: StoreWatcher;
  private readonly _header: ChatHeader;
  private readonly _input: SeBrainstormInput;
  private readonly _commitBar: RefineCommitBar;

  constructor(options: ChatPanelOptions) {
    super({ state: {} as State, ...options }, { default: { self: { style: {} } } });
    this._watcher = new StoreWatcher();
    this._header = new ChatHeader({
      id: "se-chat-header",
      chatProvider: () => visibleChat(store.getState()),
      onOpenSessions: options.onOpenSessions,
    });
    this._input = new SeBrainstormInput({ id: "se-bs-input-area" });
    this._commitBar = new RefineCommitBar({ id: "se-refine-commit" });
  }

  async compose(): Promise<UIPartColumn> {
    const { onRebuild } = this.options;
    this._watcher.dispose();
    this._watcher.watch(
      (s: RootState) => {
        const v = visibleChat(s);
        return {
          id: v?.id,
          isRefine: !!s.chat.refineChat,
          msgIds: v?.messages.map((m) => m.id).join("|") ?? "",
        };
      },
      () => onRebuild(),
      (a, b) => a.id === b.id && a.isRefine === b.isRefine && a.msgIds === b.msgIds,
    );

    const v = visibleChat(store.getState());
    const { column, row } = api.v1.ui.part;
    if (!v) {
      return column({ id: this.id, content: [] });
    }

    const messages = v.messages.slice().reverse();
    const messageParts = await Promise.all(
      messages.map((msg) =>
        new SeMessage({ id: `se-bs-msg-${msg.id}`, message: msg }).build(),
      ),
    );
    const headerPart = await this._header.build();
    const inputPart = await this._input.build();

    const isRefine = !!store.getState().chat.refineChat;
    const footerParts = isRefine
      ? [inputPart, await this._commitBar.build()]
      : [inputPart];

    return column({
      id: this.id,
      style: { height: "100%", "justify-content": "space-between" },
      content: [
        headerPart,
        column({
          id: "se-bs-list",
          style: {
            flex: 1,
            overflow: "auto",
            "flex-direction": "column-reverse",
            "justify-content": "flex-start",
            gap: "10px",
            padding: "8px",
            "padding-bottom": "20px",
          },
          content: messageParts,
        }),
        ...footerParts,
      ],
    });
  }
}
```

- [ ] **Step 2: Type-check + commit**

```bash
npx tsc --noEmit -p tsconfig.json
git add src/ui/components/ChatPanel.ts
git commit -m "feat: ChatPanel replaces BrainstormPane with spec-driven host"
```

---

## Phase 7 — Integration, surfacing, cleanup

### Task 22: Mount `ChatPanel` in the sidebar; auto-open on refine

**Files:**
- Modify: `src/ui/plugin.ts` (replace `BrainstormPane` mount with `ChatPanel`)

- [ ] **Step 1: Find the mount site**

Run: `grep -n "BrainstormPane\|new BrainstormPane\|brainstorm.*panel\|sidebar.*mount" src/ui/plugin.ts`

Note the surrounding code; the replacement must keep panel id, label, and rebuild semantics identical.

- [ ] **Step 2: Replace the mount**

Swap `BrainstormPane` for `ChatPanel`:

```ts
// before
const pane = new BrainstormPane({ id: "se-bs-panel", onRebuild });

// after
import { ChatPanel } from "./components/ChatPanel";
const pane = new ChatPanel({
  id: "se-bs-panel",
  onRebuild,
  onOpenSessions: () => /* open existing sessions modal */,
});
```

If a sessions modal exists today, route `onOpenSessions` to it. If sessions modal logic was inside `SeChatHeader`, lift its mount call into `plugin.ts` so the modal is independent of the header.

- [ ] **Step 3: Subscribe to `state.chat.refineChat` to auto-open the sidebar**

Add an effect or subscription near the panel mount:

```ts
let lastRefineId: string | null = null;
store.subscribe(() => {
  const id = store.getState().chat.refineChat?.id ?? null;
  if (id && id !== lastRefineId) {
    api.v1.ui.openSidebar?.("se-bs-panel"); // confirm the actual API call from script-types.d.ts
  }
  lastRefineId = id;
});
```

Replace `openSidebar` with the actual API exposed by `external/script-types.d.ts` — search `grep -n "openSidebar\|expandPanel\|focusPanel" external/script-types.d.ts`. If no auto-open API exists, log a debug line and rely on user click.

- [ ] **Step 4: Manually verify**

Run: `npm run build` (catches typos that tsc may permit at the entry boundary).

Then run: `npm run test`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add src/ui/plugin.ts
git commit -m "feat: mount ChatPanel; auto-open sidebar on refine open"
```

---

### Task 23: Drop `SeGenRefinePair` into Foundation fields

**Files:**
- Modify: `src/ui/components/SeFoundationSection.ts` (Intent, Style, ATTG, Contract REQUIRED/PROHIBITED/EMPHASIS)

- [ ] **Step 1: Identify the existing generate buttons**

Run: `grep -n "SeGenerationIconButton\|SeGenerationButton\|generateAction" src/ui/components/SeFoundationSection.ts`

For each field that currently mounts a generate icon button, record the field id, the generate action, and the storage key for source text.

- [ ] **Step 2: Replace each generate button with `SeGenRefinePair`**

For each field, swap:

```ts
// before
const intentBtn = new SeGenerationIconButton({
  id: IDS.FOUNDATION.INTENT_GEN_BTN,
  iconId: "zap" as IconId,
  generateAction: foundationFieldGenerateRequested({ field: "intent" }),
});

// after
import { SeGenRefinePair } from "./SeGenRefinePair";
import { foundationFieldGenerateRequested } from "../../core/store/slices/foundation"; // or wherever

const intentPair = new SeGenRefinePair({
  id: IDS.FOUNDATION.INTENT_GEN_BTN, // reuse existing id; pair becomes the row
  fieldId: "intent",
  generateAction: foundationFieldGenerateRequested({ field: "intent" }),
  refineSourceText: () => store.getState().foundation.intent ?? "",
});
```

Repeat for: `attg`, `style`, `contractRequired`, `contractProhibited`, `contractEmphasis`. Use the existing setter/getter shape of `state.foundation` to source text.

- [ ] **Step 3: Type-check + manual smoke**

Run: `npx tsc --noEmit -p tsconfig.json`
Run: `npm run test`
Expected: green.

- [ ] **Step 4: Commit**

```bash
git add src/ui/components/SeFoundationSection.ts
git commit -m "feat: surface SeGenRefinePair on Foundation fields (Intent/ATTG/Style/Contract)"
```

---

### Task 24: Replace lorebook refine row with `SeGenRefinePair`

**Files:**
- Modify: `src/ui/components/SeLorebookContentPane.ts`

- [ ] **Step 1: Remove the existing refine row**

Delete the `Refine` instructions input + button row beneath Keys (lines around 238-251 in the snapshot read during exploration). The `_refineBtn` member, its construction, and the `refineRow`/`refineInput` styles can be deleted.

- [ ] **Step 2: Replace the Content and Keys icon buttons with refine pairs**

```ts
// in constructor
this._contentBtn = new SeGenRefinePair({
  id: IDS.LOREBOOK.GEN_CONTENT_BTN,
  fieldId: "lorebookContent",
  generateRequestId: entryId ? IDS.LOREBOOK.entry(entryId).CONTENT_REQ : undefined,
  generateAction: entryId
    ? uiLorebookContentGenerationRequested({ requestId: IDS.LOREBOOK.entry(entryId).CONTENT_REQ })
    : undefined,
  refineSourceText: () => /* read CONTENT_DRAFT_RAW from storyStorage synchronously */ "",
});
```

The synchronous source-text read needs care: `api.v1.storyStorage.get` is async. Two options:
1. Maintain a small in-memory cache updated on storyStorage writes (already done by storageKey-bound inputs in SUI).
2. Read the lorebook entry directly via `api.v1.lorebook.entry(entryId)` — also async.

**Resolution:** Cache the latest content draft in component state. Subscribe to `storyStorage` writes via the existing onChange path on the textarea, and store the latest value on the component instance. Then `refineSourceText` returns the cached value:

```ts
private _latestContent = "";
private _latestKeys = "";
// ... in compose(), after multilineTextInput onChange:
onChange: async (value: string) => {
  this._latestContent = value;
  // existing lorebook.updateEntry call
},
// then:
refineSourceText: () => this._latestContent,
```

For the refine seed, also pass `entryId` so the refine spec's commit dispatcher can write back. Extend the `uiChatRefineRequested` payload to optionally carry `entryId` (Task 12 already accommodates `Record<string, never>` extension; update the type to add `entryId?: string`), and have `chat-effects.ts` store it in `chat.seed`.

- [ ] **Step 3: Same for Keys**

Repeat with `fieldId: "lorebookKeys"` and `_latestKeys`.

- [ ] **Step 4: Type-check + manual smoke**

```bash
npx tsc --noEmit -p tsconfig.json
npm run test
```

- [ ] **Step 5: Commit**

```bash
git add src/ui/components/SeLorebookContentPane.ts src/core/store/slices/ui.ts src/core/store/effects/chat-effects.ts src/core/chat-types/refine.ts
git commit -m "feat: replace lorebook refine row with SeGenRefinePair (content + keys)"
```

---

### Task 25: Delete legacy brainstorm code and references

**Files (delete):**
- `src/core/store/slices/brainstorm.ts`
- `src/core/store/effects/brainstorm-effects.ts`
- `src/core/store/effects/handlers/brainstorm.ts`
- `src/ui/components/BrainstormPane.ts`
- `src/ui/components/SeChatHeader.ts`

**Files (modify):**
- `src/core/store/index.ts` (remove brainstorm slice from `combineReducers`, remove `state.brainstorm` exports)
- `src/core/store/register-effects.ts` (remove `registerBrainstormEffects`)
- `src/core/store/types.ts` (remove `BrainstormState`, `BrainstormChat`, `BrainstormMode`, `BrainstormMessage`)
- Any file that imports from the deleted modules — update or remove.

- [ ] **Step 1: Find all references**

Run:
```bash
grep -rln "from .*slices/brainstorm\|from .*effects/brainstorm-effects\|BrainstormPane\|SeChatHeader\|BrainstormState\|BrainstormChat" src tests
```

For each match, determine: does it still need anything from the file? In most cases the answer is "no" — the new chat infrastructure has replaced it.

- [ ] **Step 2: Delete files**

```bash
git rm src/core/store/slices/brainstorm.ts \
       src/core/store/effects/brainstorm-effects.ts \
       src/core/store/effects/handlers/brainstorm.ts \
       src/ui/components/BrainstormPane.ts \
       src/ui/components/SeChatHeader.ts
```

- [ ] **Step 3: Update `src/core/store/index.ts`**

```ts
// remove:
import { brainstormSlice } from "./slices/brainstorm";
// remove from combineReducers:
brainstorm: brainstormSlice.reducer,
// remove from PERSISTED_DATA_LOADED merge logic:
brainstorm: data.brainstorm?.chats ? ... : current.brainstorm,
// remove the export:
export * from "./slices/brainstorm";
```

Migration in Task 4 already converts persisted v0.11 brainstorm data into `chat.*`, so persisted users hydrate cleanly without `state.brainstorm`.

- [ ] **Step 4: Update `src/core/store/register-effects.ts`**

Remove the `import` and the `registerBrainstormEffects(...)` call.

- [ ] **Step 5: Update `src/core/store/types.ts`**

Remove `BrainstormMode`, `BrainstormMessage`, `BrainstormChat`, `BrainstormState`. Remove `brainstorm: BrainstormState;` from `RootState`. Remove old request types `"brainstorm"`, `"brainstormChatTitle"`, `"lorebookRefine"` from `GenerationRequest.type` and the matching cases from `GenerationStrategy.target`.

- [ ] **Step 6: Resolve remaining import errors**

Run: `npx tsc --noEmit -p tsconfig.json`

For each error, either:
- Update the importer to use the new chat-* equivalents, or
- Delete the importer if it became dead code.

- [ ] **Step 7: Run the full test suite**

Run: `npm run test`
Expected: green. Any tests still referencing deleted brainstorm types must be updated to chat-slice equivalents or deleted.

- [ ] **Step 8: Build**

Run: `npm run build`
Expected: dist/NAI-story-engine.naiscript produced without errors.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor: remove legacy brainstorm slice/effects/handlers/UI"
```

---

### Task 26: CHANGELOG, version bump, manual smoke

**Files:**
- Modify: `project.yaml` (`version` → `0.12.0`)
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Bump version**

```yaml
# project.yaml — change this line:
version: 0.12.0
```

- [ ] **Step 2: Add CHANGELOG entry**

Prepend to `CHANGELOG.md` after the top heading, before existing `## [0.11.3]` section:

```markdown
## [0.12.0] - 2026-05-05

### Added

- **Typed chat session system.** Chat sessions are now driven by a `ChatTypeSpec` registry under `src/core/chat-types/`. Each type owns its own system prompt, prefill, lifecycle, sub-modes, and `contextSlice` projection. Adding a new chat type is a new file in the registry — no scattered switch statements.
- **Field-level Refine restored.** A new `SeGenRefinePair` icon-pair sits next to the generate button on Foundation Intent, ATTG, Style, Story Contract REQUIRED/PROHIBITED/EMPHASIS, and lorebook Content/Keys. Clicking refine opens an iterable chat scoped to that field. Iterate with chat instructions; **Commit** writes the latest candidate back; abandoning the chat (or **Discard**) leaves the field untouched.
- **Summary chats.** Summarizing a brainstorm now creates a `summary` chat seeded from the source transcript. The summary is a real iterable chat — tighten it, expand it, retitle it. The summary chat is saved in the session list. A `fromStoryText` seed kind is available for future story-text summaries.

### Changed

- **Brainstorm reframed as a chat type.** The Brainstorm panel's behavior moves into `brainstormSpec`. The cowriter/critic toggle stays as a `subMode` field — same UX, registry-driven.
- **`buildStoryEnginePrefix` consults the active chat's spec.** Brainstorm-context injection is now driven by `spec.contextSlice`, so each type controls what flows into Story Engine generation: brainstorm = full transcript, summary = last assistant turn, refine = nothing.

### Removed

- **Old `brainstorm` slice, effects, handlers, and UI components.** Replaced by the typed chat system.
- **Standalone `lorebookRefine` request type.** Refine now flows through the chat infrastructure.
- **Inline lorebook refine instructions input.** Replaced by the chat-driven refine pair.

### Migration

- **One-shot persisted-data migration on load.** v0.11 `brainstorm.chats[]` is auto-converted into the new `chat` slice shape on first load. Sub-mode is preserved. A toast confirms the migration. The old key is cleared. If migration fails, persisted state is left untouched and the error is logged.
```

- [ ] **Step 3: Manual smoke checklist**

These cannot be automated — confirm in the running editor:
- Brainstorm panel still works: send/edit/retry/clear, sub-mode toggle, sessions modal.
- "Sum" creates a new summary chat seeded from the brainstorm.
- Foundation Intent: clicking refine opens the chat panel with refine header. Iterate two turns, click Commit; the field updates. Repeat with Discard; the field is untouched.
- Same for ATTG, Style, Story Contract REQUIRED/PROHIBITED/EMPHASIS.
- Lorebook entry: clicking refine on Content opens the refine chat. Commit overwrites the entry.
- Refine collision: open a refine, click refine on another field — toast appears, in-flight refine remains.
- Empty source: clear a field, click refine — toast appears, no chat opens.
- Migration: load a story persisted under v0.11; sessions appear in the new system.

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md project.yaml
git commit -m "chore: bump version to 0.12.0; CHANGELOG for typed chat system"
```

---

## Phase 8 — Optional follow-ups (do not implement in this PR)

These are out of v1 scope per the spec:
- `api.v1.messaging` integration. The spec contract supports a future `external-collaborator` chat type; defer.
- Plot-crafter, brainstorm-partner, rewriter as standalone chat types. The registry makes this a small follow-up PR per type.
- Forge integration of `SeGenRefinePair`.
- Nested refine inside a refine.
- Auto-commit on close.

---

## Self-review notes

The following risks were considered while writing this plan; mitigation is in place but worth flagging during execution:

1. **Foundation field set-action names.** The plan assumes `foundationFieldSet({ field, value })`. The actual slice may use per-field actions. Task 14 Step 5 explicitly flags the verification step.
2. **Lorebook content/keys factory signatures.** The plan assumes `createLorebookContentFactory(getState, entryId, requestId, opts?)`. The current factory takes different parameters. Task 11 wrappers absorb the difference; Task 9 makes the signature explicit.
3. **`api.v1.openSidebar`.** The plan assumes such an API exists. Task 22 Step 3 explicitly notes the verification path; if it doesn't exist, the auto-open feature degrades to "panel highlights / user must click."
4. **Sessions modal ownership.** The plan assumes the existing sessions modal lives in `SeChatHeader` and needs to be lifted in Task 22 Step 2. If it lives elsewhere already, this step is a no-op.
5. **`storyStorage` synchronous reads in `refineSourceText`.** Task 24 Step 2 covers this with an in-memory cache pattern. If the cache feels brittle, the refine click handler can be made async (collect text via `await api.v1.storyStorage.get`) at the cost of a slightly slower first click.

These risks do not block the architecture; they are integration details to confirm during execution.
