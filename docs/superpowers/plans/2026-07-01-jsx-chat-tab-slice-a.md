# JSX Chat Tab — Slice A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the Chat tab shell and the brainstorm + refine chat types to the JSX panel, driven by the existing `core/` chat brain, and wire the refine loop from the already-ported JSX Foundation fields.

**Architecture:** View-only port. nai-store's `chat` slice stays the single source of truth; the polymorphic `ChatTypeSpec` registry (`getChatTypeSpec(type)`) drives one generic JSX renderer so brainstorm and refine both work without branching. The JSX panel gains an internal `Chat | Story Engine` tab shell whose active tab is local state, nudged by store subscriptions (refine opened → Chat; refine committed/discarded → Story Engine). No `core/` changes.

**Tech Stack:** TypeScript (strict), NovelAI JSX/Preact runtime (`h`/`useState`/`useEffect`/`useRef`/`useSyncExternalStore` globals), nai-store, nibs build, vitest.

## Global Constraints

- **No `core/` changes.** Slices, chat-type specs, effects, and strategies are reused verbatim. Only `src/ui-jsx/` and `docs`/`CHANGELOG` change.
- **nai-store is the source of truth.** Read via `useSlice`; mutate via `store.dispatch` of existing actions. Never add a Preact store.
- **QuickJS / no DOM:** no `setTimeout` (use `api.v1.timers`), no `console.log` (use `api.v1.log()`).
- **JSX whitelist:** no `dangerouslySetInnerHTML`, no `<style>`. `h` is a runtime global (never imported). Icons come from the nibs-provided `nai:icons/feather` build-time virtual module (never hand-authored); import the PascalCase names you need and trust the generated types.
- **Uncontrolled textareas:** a `<textarea>` renders child text, NOT a `value` attribute (the renderer applies `value` via setAttribute, which textarea ignores). Seed display via `{initial}` child text; track edits via `onInput`. To clear an uncontrolled textarea, bump a `key` to remount it.
- **Theme-var-only colors:** all colors are `var(--theme-*)` via the `T` tokens (`src/ui-jsx/style.ts`), which is `satisfies Record<string, ThemeVarRef>`. No static hex.
- **Send handoff:** the `uiChatSubmitUserMessage` effect reads the composer text from storyStorage key `"se-bs-input"` (`IDS.BRAINSTORM.INPUT`) and clears it. The JSX input must `await api.v1.storyStorage.set("se-bs-input", draft)` **before** dispatching, then clear its own local draft.
- **Version:** `project.yaml` is already at `0.14.0` on this branch — do NOT bump again. Update `CHANGELOG.md`'s existing `[0.14.0]` section for user-visible behavior.
- **Every task ends green:** `npx tsc --noEmit` exits 0, `npm run build` succeeds, and `npm run test` stays at its passing count (384 at plan time). UI behavior is verified manually in-app (Chrome ext, story `jsx-rewrite`) per the project convention; only pure logic gets vitest.
- **Relative import depths** from `src/ui-jsx/panels/chat/*.tsx`: bridge `../../bridge`, style `../../style`, hooks `../../hooks`, core `../../../core/store`, chat-types `../../../core/chat-types`.

---

### Task 1: Pure chat-action helpers

**Files:**

- Create: `src/ui-jsx/panels/chat/chat-actions.ts`
- Test: `tests/ui-jsx/chat-actions.test.ts`

**Interfaces:**

- Produces:
  - `CHAT_INPUT_KEY: string` — `"se-bs-input"` (must equal `IDS.BRAINSTORM.INPUT`, the key the `uiChatSubmitUserMessage` effect reads).
  - `decideFieldAction(text: string): "generate" | "refine"` — whitespace-only → `"generate"`, otherwise `"refine"`.
  - `nextBrainstormTitle(chats: ReadonlyArray<{ type: string }>): string` — `"Brainstorm N"` where N = (count of brainstorm chats) + 1.

- [ ] **Step 1: Write the failing test**

```ts
// tests/ui-jsx/chat-actions.test.ts
import { describe, it, expect } from "vitest";
import {
  CHAT_INPUT_KEY,
  decideFieldAction,
  nextBrainstormTitle,
} from "../../src/ui-jsx/panels/chat/chat-actions";

describe("chat-actions", () => {
  it("CHAT_INPUT_KEY matches the effect's storyStorage key", () => {
    expect(CHAT_INPUT_KEY).toBe("se-bs-input");
  });

  it("decideFieldAction: empty / whitespace → generate", () => {
    expect(decideFieldAction("")).toBe("generate");
    expect(decideFieldAction("   \n\t ")).toBe("generate");
  });

  it("decideFieldAction: non-empty → refine", () => {
    expect(decideFieldAction("Author: X")).toBe("refine");
  });

  it("nextBrainstormTitle counts only brainstorm chats", () => {
    expect(nextBrainstormTitle([])).toBe("Brainstorm 1");
    expect(
      nextBrainstormTitle([{ type: "brainstorm" }, { type: "refine" }]),
    ).toBe("Brainstorm 2");
    expect(
      nextBrainstormTitle([{ type: "brainstorm" }, { type: "brainstorm" }]),
    ).toBe("Brainstorm 3");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ui-jsx/chat-actions.test.ts`
Expected: FAIL — cannot resolve `../../src/ui-jsx/panels/chat/chat-actions`.

- [ ] **Step 3: Write the implementation**

```ts
// src/ui-jsx/panels/chat/chat-actions.ts
// Small, pure helpers for the JSX chat UI. Kept framework-free so they are
// unit-testable headless.

// Must equal IDS.BRAINSTORM.INPUT — the storyStorage key the
// `uiChatSubmitUserMessage` effect reads the composer text from. Duplicated as a
// bare constant to avoid coupling ui-jsx to the SUI `ui/framework/ids` tree
// (which is slated for removal). If the effect's key ever changes, change here.
export const CHAT_INPUT_KEY = "se-bs-input";

/** Adaptive Foundation zap: an empty field generates, a field with content
 *  opens a refine. Mirrors SUI's SeGenRefinePair unified mode. */
export function decideFieldAction(text: string): "generate" | "refine" {
  return text.trim() === "" ? "generate" : "refine";
}

/** Title for a newly created brainstorm chat: "Brainstorm N". */
export function nextBrainstormTitle(
  chats: ReadonlyArray<{ type: string }>,
): string {
  const count = chats.filter((c) => c.type === "brainstorm").length;
  return `Brainstorm ${count + 1}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/ui-jsx/chat-actions.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/ui-jsx/panels/chat/chat-actions.ts tests/ui-jsx/chat-actions.test.ts
git commit -m "feat(jsx): pure chat-action helpers (decideFieldAction, nextBrainstormTitle)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Panel tab shell (Chat | Story Engine) + tab-switch subscriptions

**Files:**

- Modify: `src/ui-jsx/App.tsx` (currently renders `<Foundation/>` only)

**Interfaces:**

- Consumes: `Foundation` from `./panels/Foundation`; `T`, `SP` from `./style`; `store`, `chatCreated`, `chatSwitched`, `uiChatRefineCommitted`, `uiChatRefineDiscarded`, `activeSavedChat` from `./`-relative `../core/store`… (App is at `src/ui-jsx/App.tsx`, so `./core` is `../core` — App imports core via `../core/store`). `matchesAction` from `nai-store`.
- Produces: the JSX panel root with an internal two-tab shell. The Chat tab renders a placeholder until Task 3.

- [ ] **Step 1: Replace `App.tsx` with the tab shell**

```tsx
// src/ui-jsx/App.tsx
import { Foundation } from "./panels/Foundation";
import { T, SP } from "./style";
import {
  store,
  chatCreated,
  chatSwitched,
  uiChatRefineCommitted,
  uiChatRefineDiscarded,
  activeSavedChat,
} from "../core/store";
import { matchesAction } from "nai-store";

type Tab = "chat" | "engine";

function tabButtonStyle(active: boolean) {
  return {
    flex: 1,
    padding: SP.md,
    background: "none",
    border: "none",
    cursor: "pointer",
    color: active ? T.textHeadings : T.textDisabled,
    fontWeight: active ? "bold" : "normal",
    borderBottom: active
      ? `2px solid ${T.textHeadings}`
      : "2px solid transparent",
  };
}

export function App() {
  const [tab, setTab] = useState<Tab>("engine");

  // Mirror the SUI plugin's tab-switch effects, local to the JSX panel:
  // a refine opening surfaces the Chat tab; commit/discard returns to Engine.
  useEffect(() => {
    const unsubs = [
      store.subscribeEffect(matchesAction(chatCreated), (action) => {
        if (action.payload.chat.type === "refine") setTab("chat");
      }),
      store.subscribeEffect(
        matchesAction(chatSwitched),
        (action, { getState }) => {
          const c = getState().chat.chats.find(
            (x) => x.id === action.payload.id,
          );
          if (c?.type === "refine") setTab("chat");
        },
      ),
      store.subscribeEffect(matchesAction(uiChatRefineCommitted), () =>
        setTab("engine"),
      ),
      store.subscribeEffect(matchesAction(uiChatRefineDiscarded), () =>
        setTab("engine"),
      ),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        color: T.text,
        fontFamily: T.fontDefault,
      }}
    >
      <div style={{ display: "flex" }}>
        <button
          style={tabButtonStyle(tab === "chat")}
          onClick={() => setTab("chat")}
        >
          Chat
        </button>
        <button
          style={tabButtonStyle(tab === "engine")}
          onClick={() => setTab("engine")}
        >
          Story Engine
        </button>
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: SP.md }}>
        {tab === "chat" ? (
          <div style={{ color: T.textDisabled }}>Chat (coming next task)</div>
        ) : (
          <Foundation />
        )}
      </div>
    </div>
  );
}
```

Note: `activeSavedChat` is imported now because Task 3 will use it here; if `noUnusedLocals` flags it before then, keep the import but reference it in a `void activeSavedChat;` throwaway is NOT allowed — instead, delay adding the import until Task 3. **For this task, remove `activeSavedChat` from the import list** (add it back in Task 3).

- [ ] **Step 2: Typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: tsc exits 0; build prints "✅ Build complete!".

- [ ] **Step 3: Manual verification (reload `dist/NAI-story-engine.naiscript`, open "Story Engine (JSX)")**

- Two tabs appear: **Chat** and **Story Engine**, with the active one underlined/bold.
- Story Engine tab shows the Foundation ATTG/Style cards (unchanged).
- Chat tab shows the "Chat (coming next task)" placeholder.
- Switching tabs works; no console errors (`api.v1.log` / devtools).

- [ ] **Step 4: Commit**

```bash
git add src/ui-jsx/App.tsx
git commit -m "feat(jsx): panel tab shell (Chat | Story Engine) + refine tab-switch subs

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Chat shell + message bubbles + composer (brainstorm send/stream)

**Files:**

- Create: `src/ui-jsx/panels/chat/Chat.tsx`
- Create: `src/ui-jsx/panels/chat/Message.tsx`
- Create: `src/ui-jsx/panels/chat/ChatInput.tsx`
- Modify: `src/ui-jsx/App.tsx` (render `<Chat/>` in the Chat tab)

**Interfaces:**

- Consumes: `useSlice` (`../../bridge`), `T`/`SP` (`../../style`), `store` + actions + `activeSavedChat` (`../../../core/store`), `getChatTypeSpec` (`../../../core/chat-types`), `CHAT_INPUT_KEY` (`./chat-actions`), types `Chat`/`ChatMessage` (`../../../core/chat-types/types`).
- Produces:
  - `Chat(): VNode` — the chat shell (header title + scrollable message list + composer). Header controls land in Task 4; for now the header is just the chat title.
  - `Message(props: { chatId: string; message: ChatMessage }): VNode` — one role-styled bubble, content streams via `useSlice`. Controls land in Task 4.
  - `ChatInput(): VNode` — composer with Send (+ Clear per spec).

- [ ] **Step 1: Create `Message.tsx` (display + streaming only)**

```tsx
// src/ui-jsx/panels/chat/Message.tsx
import { useSlice } from "../../bridge";
import { T, SP } from "../../style";
import type { RootState } from "../../../core/store";
import type { ChatMessage } from "../../../core/chat-types/types";

type MessageProps = { chatId: string; message: ChatMessage };

function readContent(s: RootState, chatId: string, msg: ChatMessage): string {
  return (
    s.chat.chats
      .find((c) => c.id === chatId)
      ?.messages.find((m) => m.id === msg.id)?.content ?? msg.content
  );
}

const BUBBLE = {
  rowUser: { width: "100%", justifyContent: "flex-end", display: "flex" },
  rowAsst: { width: "100%", justifyContent: "flex-start", display: "flex" },
  rowSystem: { width: "100%", justifyContent: "center", display: "flex" },
  bubbleUser: {
    padding: SP.md,
    width: "85%",
    background: "rgba(64,156,255,0.2)",
    borderRadius: "12px 12px 0 12px",
    whiteSpace: "pre-wrap",
  },
  bubbleAsst: {
    padding: SP.md,
    width: "85%",
    background: "rgba(255,255,255,0.05)",
    borderRadius: "12px 12px 12px 0",
    whiteSpace: "pre-wrap",
  },
  bubbleSystem: {
    padding: "8px 10px",
    width: "92%",
    border: "1px dashed rgba(255,255,255,0.18)",
    background: "rgba(255,255,255,0.02)",
    borderRadius: "6px",
    opacity: 0.8,
    fontStyle: "italic",
    whiteSpace: "pre-wrap",
  },
} as const;

export function Message(props: MessageProps) {
  const { chatId, message } = props;
  const content = useSlice((s) => readContent(s, chatId, message));
  const isUser = message.role === "user";
  const isSystem = message.role === "system";
  const rowStyle = isSystem
    ? BUBBLE.rowSystem
    : isUser
      ? BUBBLE.rowUser
      : BUBBLE.rowAsst;
  const bubbleStyle = isSystem
    ? BUBBLE.bubbleSystem
    : isUser
      ? BUBBLE.bubbleUser
      : BUBBLE.bubbleAsst;
  return (
    <div style={rowStyle}>
      <div style={{ ...bubbleStyle, color: T.text }}>{content || "…"}</div>
    </div>
  );
}
```

- [ ] **Step 2: Create `ChatInput.tsx`**

```tsx
// src/ui-jsx/panels/chat/ChatInput.tsx
import { useSlice } from "../../bridge";
import { T, SP } from "../../style";
import {
  store,
  activeSavedChat,
  uiChatSubmitUserMessage,
} from "../../../core/store";
import { getChatTypeSpec } from "../../../core/chat-types";
import { CHAT_INPUT_KEY } from "./chat-actions";

export function ChatInput() {
  const chatId = useSlice((s) => s.chat.activeChatId);
  const chatType = useSlice((s) => activeSavedChat(s.chat)?.type ?? "");
  const draftRef = useRef("");
  const [nonce, setNonce] = useState(0);

  if (!chatId || !chatType) return null;
  const spec = getChatTypeSpec(chatType);
  const ctx = { getState: store.getState, dispatch: store.dispatch };

  const doSend = () => {
    const text = draftRef.current;
    void (async () => {
      // Hand the composer text to the effect via its storyStorage slot, then
      // dispatch. Await the set so the effect's get() sees the latest value.
      await api.v1.storyStorage.set(CHAT_INPUT_KEY, text);
      store.dispatch(uiChatSubmitUserMessage({ chatId }));
    })();
    draftRef.current = "";
    setNonce((n) => n + 1); // remount textarea → clears the uncontrolled value
  };

  const doClear = () => {
    if (spec.onClear) {
      const chat = activeSavedChat(store.getState().chat);
      if (chat) spec.onClear(chat, ctx);
      return;
    }
    draftRef.current = "";
    setNonce((n) => n + 1);
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: SP.sm,
        padding: SP.md,
      }}
    >
      <textarea
        key={nonce}
        rows={3}
        placeholder={spec.inputPlaceholder ?? "Message…"}
        onInput={(e) => {
          draftRef.current = e.target.value ?? "";
        }}
        style={{
          background: T.bg2,
          color: T.text,
          fontFamily: T.fontDefault,
          padding: SP.md,
          border: "none",
          resize: "vertical",
        }}
      >
        {""}
      </textarea>
      <div style={{ display: "flex", gap: SP.sm }}>
        <button onClick={doSend} style={{ padding: "4px 16px" }}>
          {spec.sendLabel ?? "Send"}
        </button>
        {spec.showClearButton && <button onClick={doClear}>Clear</button>}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create `Chat.tsx` (shell; header = title only for now)**

```tsx
// src/ui-jsx/panels/chat/Chat.tsx
import { useSlice } from "../../bridge";
import { T, SP } from "../../style";
import { store, activeSavedChat } from "../../../core/store";
import type { RootState } from "../../../core/store";
import { Message } from "./Message";
import { ChatInput } from "./ChatInput";

// Primitive re-render key: chat identity + message-id sequence. Streaming
// content changes are handled inside each Message (its own useSlice), so the
// shell does NOT rebuild per token.
function visibleChatKey(s: RootState): string {
  const c = activeSavedChat(s.chat);
  if (!c) return "";
  return c.id + "::" + c.messages.map((m) => m.id).join(",");
}

export function Chat() {
  const key = useSlice(visibleChatKey);
  if (!key) return null;
  const chat = activeSavedChat(store.getState().chat);
  if (!chat) return null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        justifyContent: "space-between",
      }}
    >
      <div
        style={{ color: T.textHeadings, fontWeight: "bold", padding: SP.md }}
      >
        {chat.title}
      </div>
      <div
        style={{
          flex: 1,
          overflow: "auto",
          display: "flex",
          flexDirection: "column-reverse",
          justifyContent: "flex-start",
          gap: "10px",
          padding: SP.md,
        }}
      >
        {chat.messages
          .map((m) => <Message key={m.id} chatId={chat.id} message={m} />)
          .reverse()}
      </div>
      <ChatInput />
    </div>
  );
}
```

- [ ] **Step 4: Render `<Chat/>` in App's Chat tab**

In `src/ui-jsx/App.tsx`: add `import { Chat } from "./panels/chat/Chat";` and replace the placeholder:

```tsx
{
  tab === "chat" ? <Chat /> : <Foundation />;
}
```

- [ ] **Step 5: Typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: tsc exits 0; build succeeds.

- [ ] **Step 6: Manual verification (reload; Chat tab)**

- The default "Brainstorm 1" chat renders (title shown, empty list).
- Type a message, click **Send**: composer clears; your message appears as a right-aligned blue bubble; an assistant bubble streams in (left, grey). Compare content against the SUI Chat tab for the same message.
- Long content wraps; the list stays pinned to the bottom (column-reverse).

- [ ] **Step 7: Commit**

```bash
git add src/ui-jsx/panels/chat/Chat.tsx src/ui-jsx/panels/chat/Message.tsx src/ui-jsx/panels/chat/ChatInput.tsx src/ui-jsx/App.tsx
git commit -m "feat(jsx): chat shell, message bubbles, composer (brainstorm send/stream)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Message controls (edit / retry / delete) + system Context collapse

**Files:**

- Modify: `src/ui-jsx/panels/chat/Message.tsx`

**Interfaces:**

- Consumes: `useDraftField` (`../../hooks`); icons `Edit`, `RotateCw`, `Trash`, `X`, `Check` from the `nai:icons/feather` virtual module (nibs-provided; trust the generated types); `messageUpdated`, `messageRemoved`, `uiChatRetryGeneration` from `../../../core/store`.
- Produces: `Message` now supports inline edit (→ `messageUpdated`), retry (assistant, → `uiChatRetryGeneration`), delete (→ `messageRemoved`); system messages render collapsed with a "Context" header.

- [ ] **Step 1: Rewrite `Message.tsx` with controls + edit + system collapse**

```tsx
// src/ui-jsx/panels/chat/Message.tsx
import { useSlice } from "../../bridge";
import { useDraftField } from "../../hooks";
import { T, SP } from "../../style";
import {
  store,
  messageUpdated,
  messageRemoved,
  uiChatRetryGeneration,
} from "../../../core/store";
import type { RootState } from "../../../core/store";
import type { ChatMessage } from "../../../core/chat-types/types";
import { Edit, RotateCw, Trash, X, Check } from "nai:icons/feather";

type MessageProps = { chatId: string; message: ChatMessage };

const ICON = 14;

function readContent(s: RootState, chatId: string, msg: ChatMessage): string {
  return (
    s.chat.chats
      .find((c) => c.id === chatId)
      ?.messages.find((m) => m.id === msg.id)?.content ?? msg.content
  );
}

const BUBBLE = {
  rowUser: { width: "100%", justifyContent: "flex-end", display: "flex" },
  rowAsst: { width: "100%", justifyContent: "flex-start", display: "flex" },
  rowSystem: { width: "100%", justifyContent: "center", display: "flex" },
  bubbleUser: {
    padding: SP.md,
    width: "85%",
    background: "rgba(64,156,255,0.2)",
    borderRadius: "12px 12px 0 12px",
    whiteSpace: "pre-wrap",
  },
  bubbleAsst: {
    padding: SP.md,
    width: "85%",
    background: "rgba(255,255,255,0.05)",
    borderRadius: "12px 12px 12px 0",
    whiteSpace: "pre-wrap",
  },
  bubbleSystem: {
    padding: "8px 10px",
    width: "92%",
    border: "1px dashed rgba(255,255,255,0.18)",
    background: "rgba(255,255,255,0.02)",
    borderRadius: "6px",
    opacity: 0.8,
    fontStyle: "italic",
    whiteSpace: "pre-wrap",
  },
} as const;

const iconBtn = {
  background: "none",
  border: "none",
  cursor: "pointer",
  color: T.text,
  padding: "2px",
  display: "flex",
  alignItems: "center",
} as const;

function EditBody(props: {
  chatId: string;
  message: ChatMessage;
  content: string;
  onDone: () => void;
}) {
  const { value, setValue } = useDraftField(props.content);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SP.sm }}>
      <textarea
        rows={4}
        onInput={(e) => setValue(e.target.value ?? "")}
        style={{
          background: T.bg2,
          color: T.text,
          fontFamily: T.fontDefault,
          padding: SP.sm,
          border: "none",
          resize: "vertical",
        }}
      >
        {props.content}
      </textarea>
      <div style={{ display: "flex", gap: SP.sm }}>
        <button
          style={iconBtn}
          title="Save"
          onClick={() => {
            store.dispatch(
              messageUpdated({
                chatId: props.chatId,
                id: props.message.id,
                content: value,
              }),
            );
            props.onDone();
          }}
        >
          <Check size={ICON} />
        </button>
        <button style={iconBtn} title="Cancel" onClick={props.onDone}>
          <X size={ICON} />
        </button>
      </div>
    </div>
  );
}

export function Message(props: MessageProps) {
  const { chatId, message } = props;
  const content = useSlice((s) => readContent(s, chatId, message));
  const [editing, setEditing] = useState(false);
  const [collapsed, setCollapsed] = useState(true);
  const isUser = message.role === "user";
  const isSystem = message.role === "system";

  const rowStyle = isSystem
    ? BUBBLE.rowSystem
    : isUser
      ? BUBBLE.rowUser
      : BUBBLE.rowAsst;
  const bubbleStyle = isSystem
    ? BUBBLE.bubbleSystem
    : isUser
      ? BUBBLE.bubbleUser
      : BUBBLE.bubbleAsst;

  // System "Context" bubbles: collapsed by default, expandable, delete only.
  if (isSystem) {
    return (
      <div style={rowStyle}>
        <div style={{ ...bubbleStyle, color: T.text }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <button
              style={{ ...iconBtn, fontStyle: "italic" }}
              onClick={() => setCollapsed((c) => !c)}
            >
              {collapsed ? "▸ Context" : "▾ Context"}
            </button>
            <button
              style={iconBtn}
              title="Delete"
              onClick={() =>
                store.dispatch(messageRemoved({ chatId, id: message.id }))
              }
            >
              <Trash size={ICON} />
            </button>
          </div>
          {!collapsed && <div style={{ marginTop: SP.sm }}>{content}</div>}
        </div>
      </div>
    );
  }

  return (
    <div style={rowStyle}>
      <div style={{ ...bubbleStyle, color: T.text }}>
        {editing ? (
          <EditBody
            chatId={chatId}
            message={message}
            content={content}
            onDone={() => setEditing(false)}
          />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: SP.sm }}>
            <div>{content || "…"}</div>
            <div
              style={{
                display: "flex",
                gap: SP.sm,
                justifyContent: "flex-end",
              }}
            >
              <button
                style={iconBtn}
                title="Edit"
                onClick={() => setEditing(true)}
              >
                <Edit size={ICON} />
              </button>
              {message.role === "assistant" && (
                <button
                  style={iconBtn}
                  title="Retry"
                  onClick={() =>
                    store.dispatch(
                      uiChatRetryGeneration({ chatId, messageId: message.id }),
                    )
                  }
                >
                  <RotateCw size={ICON} />
                </button>
              )}
              <button
                style={iconBtn}
                title="Delete"
                onClick={() =>
                  store.dispatch(messageRemoved({ chatId, id: message.id }))
                }
              >
                <Trash size={ICON} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: tsc exits 0; build succeeds. (The `nai:icons/feather` imports resolve against nibs' build-time virtual module and its generated types — a wrong name would fail `tsc` here.)

- [ ] **Step 3: Manual verification (reload; Chat tab)**

- Each non-system bubble shows Edit / (assistant) Retry / Delete controls.
- Edit → textarea seeded with the message text; Save writes it (bubble updates), Cancel discards.
- Retry on an assistant message regenerates it.
- Delete removes the bubble.
- Send a brainstorm message that seeds a system "Context" bubble (or trigger a refine later) — it renders collapsed with a "▸ Context" toggle and a delete; expanding shows the body.

- [ ] **Step 4: Commit**

```bash
git add src/ui-jsx/panels/chat/Message.tsx
git commit -m "feat(jsx): message edit/retry/delete + collapsible system Context bubble

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Chat header controls (sub-mode, summarize, new, sessions, back)

**Files:**

- Create: `src/ui-jsx/panels/chat/ChatHeader.tsx`
- Modify: `src/ui-jsx/panels/chat/Chat.tsx` (replace the title-only header with `<ChatHeader>`; add sessions toggle state and an `onBack` prop)
- Modify: `src/ui-jsx/App.tsx` (pass `onBack` that switches to the Story Engine tab)

**Interfaces:**

- Consumes: `useSlice`; `store`, `chatCreated`, `chatSwitched`, `subModeChanged`, `uiChatSummarizeRequested`, `activeSavedChat` from `../../../core/store`; `getChatTypeSpec` from `../../../core/chat-types`; `nextBrainstormTitle` from `./chat-actions`; icons `Plus`, `Folder`, `ArrowLeft` from the `nai:icons/feather` virtual module; type `Chat as ChatT`, `HeaderControl` from `../../../core/chat-types/types`.
- Produces: `ChatHeader(props: { onBack: () => void; onOpenSessions: () => void }): VNode` — renders `spec.headerControls()` for the active chat. `Chat` now accepts `props: { onBack: () => void }` and manages `showSessions` state (Sessions view lands in Task 6; for now the sessions button toggles a placeholder).

- [ ] **Step 1: Create `ChatHeader.tsx`**

```tsx
// src/ui-jsx/panels/chat/ChatHeader.tsx
import { useSlice } from "../../bridge";
import { T, SP } from "../../style";
import {
  store,
  activeSavedChat,
  chatCreated,
  chatSwitched,
  subModeChanged,
  uiChatSummarizeRequested,
} from "../../../core/store";
import { getChatTypeSpec } from "../../../core/chat-types";
import type { Chat as ChatT } from "../../../core/chat-types/types";
import { nextBrainstormTitle } from "./chat-actions";
import { Plus, Folder, ArrowLeft } from "nai:icons/feather";

const ICON = 16;
const MODE_COWRITER = "rgba(80,200,120,0.25)";
const MODE_CRITIC = "rgba(255,100,100,0.25)";

const iconBtn = {
  background: "none",
  border: "none",
  cursor: "pointer",
  color: T.text,
  padding: "4px",
  display: "flex",
  alignItems: "center",
} as const;

function modeBtnStyle(active: boolean, color: string) {
  return {
    padding: "2px 8px",
    fontSize: "0.75em",
    borderRadius: "4px",
    background: active ? color : "transparent",
    border: active
      ? "1px solid rgba(255,255,255,0.2)"
      : "1px solid rgba(255,255,255,0.08)",
    opacity: active ? 1 : 0.5,
    cursor: "pointer",
    color: T.text,
  };
}

type ChatHeaderProps = { onBack: () => void; onOpenSessions: () => void };

export function ChatHeader(props: ChatHeaderProps) {
  // Re-render on title / subMode / type / id changes.
  const stamp = useSlice((s) => {
    const c = activeSavedChat(s.chat);
    return c ? `${c.id}|${c.title}|${c.subMode ?? ""}|${c.type}` : "";
  });
  if (!stamp) return null;
  const chat = activeSavedChat(store.getState().chat)!;
  const spec = getChatTypeSpec(chat.type);
  const controls = spec.headerControls(chat, {
    getState: store.getState,
    dispatch: store.dispatch,
  });

  const hasBack = controls.some((c) => c.kind === "backButton");

  const trailing = controls.map((c) => {
    switch (c.kind) {
      case "subModeToggle":
        return (
          <div style={{ display: "flex", gap: SP.xs }}>
            <button
              style={modeBtnStyle(chat.subMode === "cowriter", MODE_COWRITER)}
              onClick={() =>
                store.dispatch(
                  subModeChanged({ id: chat.id, subMode: "cowriter" }),
                )
              }
            >
              Co
            </button>
            <button
              style={modeBtnStyle(chat.subMode === "critic", MODE_CRITIC)}
              onClick={() =>
                store.dispatch(
                  subModeChanged({ id: chat.id, subMode: "critic" }),
                )
              }
            >
              Crit
            </button>
          </div>
        );
      case "summarizeButton":
        return (
          <button
            style={{ ...modeBtnStyle(false, "transparent"), opacity: 1 }}
            onClick={() =>
              store.dispatch(
                uiChatSummarizeRequested({
                  seed: { kind: "fromChat", sourceChatId: chat.id },
                }),
              )
            }
          >
            Sum
          </button>
        );
      case "newChatButton":
        return (
          <button
            style={iconBtn}
            title="New chat"
            onClick={() => {
              const newChat: ChatT = {
                id: api.v1.uuid(),
                type: "brainstorm",
                title: nextBrainstormTitle(store.getState().chat.chats),
                subMode: "cowriter",
                messages: [],
                seed: { kind: "blank" },
              };
              store.dispatch(chatCreated({ chat: newChat }));
              store.dispatch(chatSwitched({ id: newChat.id }));
            }}
          >
            <Plus size={ICON} />
          </button>
        );
      case "sessionsButton":
        return (
          <button
            style={iconBtn}
            title="Sessions"
            onClick={props.onOpenSessions}
          >
            <Folder size={ICON} />
          </button>
        );
      default:
        // label (title already rendered), phaseIndicator, scrubIndicator (forge — Slice B)
        return null;
    }
  });

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: SP.sm,
        padding: SP.md,
      }}
    >
      {hasBack && (
        <button style={iconBtn} title="Back" onClick={props.onBack}>
          <ArrowLeft size={ICON} />
        </button>
      )}
      <span
        style={{
          flex: 1,
          color: T.textHeadings,
          fontWeight: "bold",
          fontSize: "0.85em",
        }}
      >
        {chat.title}
      </span>
      {trailing}
    </div>
  );
}
```

- [ ] **Step 2: Wire `ChatHeader` into `Chat.tsx`**

Replace the title-only header `<div>…{chat.title}…</div>` with the header component and thread props. Update `Chat` to accept `props: { onBack: () => void }` and hold a `showSessions` toggle (Sessions view is Task 6; here it flips a placeholder):

```tsx
// src/ui-jsx/panels/chat/Chat.tsx  (changed parts)
import { ChatHeader } from "./ChatHeader";
// ...
export function Chat(props: { onBack: () => void }) {
  const key = useSlice(visibleChatKey);
  const [showSessions, setShowSessions] = useState(false);
  if (!key) return null;
  const chat = activeSavedChat(store.getState().chat);
  if (!chat) return null;

  if (showSessions) {
    return (
      <div style={{ padding: SP.md, color: T.textDisabled }}>
        Sessions (coming next task)
        <div>
          <button onClick={() => setShowSessions(false)}>Back</button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        justifyContent: "space-between",
      }}
    >
      <ChatHeader
        onBack={props.onBack}
        onOpenSessions={() => setShowSessions(true)}
      />
      <div
        style={{
          flex: 1,
          overflow: "auto",
          display: "flex",
          flexDirection: "column-reverse",
          justifyContent: "flex-start",
          gap: "10px",
          padding: SP.md,
        }}
      >
        {chat.messages
          .map((m) => <Message key={m.id} chatId={chat.id} message={m} />)
          .reverse()}
      </div>
      <ChatInput />
    </div>
  );
}
```

- [ ] **Step 3: Pass `onBack` from `App.tsx`**

In `App.tsx`, render `<Chat onBack={() => setTab("engine")} />` in the Chat tab.

- [ ] **Step 4: Typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: tsc exits 0; build succeeds.

- [ ] **Step 5: Manual verification (reload; Chat tab)**

- Header shows the chat title, and for brainstorm: **Co/Crit** toggle (active one highlighted green/red), **Sum**, **+** (new), **folder** (sessions).
- Co/Crit switches sub-mode (highlight moves); the next brainstorm reply reflects the mode.
- **+** creates "Brainstorm 2" and switches to it.
- **Sum** creates a summary chat (verify a summary chat appears / streams).
- **folder** shows the "Sessions (coming next task)" placeholder with a Back.

- [ ] **Step 6: Commit**

```bash
git add src/ui-jsx/panels/chat/ChatHeader.tsx src/ui-jsx/panels/chat/Chat.tsx src/ui-jsx/App.tsx
git commit -m "feat(jsx): spec-driven chat header controls (sub-mode/summarize/new/sessions/back)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Sessions in-panel view

**Files:**

- Create: `src/ui-jsx/panels/chat/Sessions.tsx`
- Modify: `src/ui-jsx/panels/chat/Chat.tsx` (render `<Sessions>` when `showSessions`)

**Interfaces:**

- Consumes: `useSlice`; `store`, `chatCreated`, `chatSwitched`, `chatRenamed`, `chatDeleted`, `activeSavedChat` from `../../../core/store`; `nextBrainstormTitle` from `./chat-actions`; type `Chat as ChatT`; icons `Plus`, `Trash`, `ArrowLeft` from the `nai:icons/feather` virtual module.
- Produces: `Sessions(props: { onBack: () => void }): VNode` — chat list with New / switch / rename / delete.

- [ ] **Step 1: Create `Sessions.tsx`**

```tsx
// src/ui-jsx/panels/chat/Sessions.tsx
import { useSlice } from "../../bridge";
import { T, SP } from "../../style";
import {
  store,
  chatCreated,
  chatSwitched,
  chatRenamed,
  chatDeleted,
} from "../../../core/store";
import type { Chat as ChatT } from "../../../core/chat-types/types";
import { nextBrainstormTitle } from "./chat-actions";
import { Plus, Trash, ArrowLeft } from "nai:icons/feather";

const ICON = 14;
const iconBtn = {
  background: "none",
  border: "none",
  cursor: "pointer",
  color: T.text,
  padding: "4px",
  display: "flex",
  alignItems: "center",
} as const;

export function Sessions(props: { onBack: () => void }) {
  const stamp = useSlice(
    (s) =>
      s.chat.chats.map((c) => `${c.id}:${c.title}`).join("|") +
      "#" +
      (s.chat.activeChatId ?? ""),
  );
  void stamp; // re-render trigger
  const chats = store.getState().chat.chats;
  const activeId = store.getState().chat.activeChatId;

  const newChat = () => {
    const c: ChatT = {
      id: api.v1.uuid(),
      type: "brainstorm",
      title: nextBrainstormTitle(chats),
      subMode: "cowriter",
      messages: [],
      seed: { kind: "blank" },
    };
    store.dispatch(chatCreated({ chat: c }));
    store.dispatch(chatSwitched({ id: c.id }));
    props.onBack();
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: SP.sm,
        padding: SP.md,
        height: "100%",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: SP.sm }}>
        <button style={iconBtn} title="Back" onClick={props.onBack}>
          <ArrowLeft size={16} />
        </button>
        <span style={{ flex: 1, color: T.textHeadings, fontWeight: "bold" }}>
          Sessions
        </span>
        <button style={iconBtn} title="New chat" onClick={newChat}>
          <Plus size={16} />
        </button>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: SP.xs,
          overflow: "auto",
        }}
      >
        {chats.map((c) => (
          <div
            key={c.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: SP.sm,
              padding: SP.sm,
              background: c.id === activeId ? T.bg2 : "transparent",
              borderRadius: "4px",
            }}
          >
            <button
              style={{ ...iconBtn, flex: 1, justifyContent: "flex-start" }}
              onClick={() => {
                store.dispatch(chatSwitched({ id: c.id }));
                props.onBack();
              }}
            >
              {c.title}
            </button>
            <button
              style={iconBtn}
              title="Rename"
              onClick={() => {
                const name = api.v1.ui.prompt
                  ? undefined // placeholder guard; see note below
                  : undefined;
                void name;
                const next = c.title; // replaced below
                store.dispatch(chatRenamed({ id: c.id, title: next }));
              }}
            >
              ✎
            </button>
            <button
              style={iconBtn}
              title="Delete"
              onClick={() => store.dispatch(chatDeleted({ id: c.id }))}
            >
              <Trash size={ICON} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
```

Note on rename: NovelAI's JSX/QuickJS environment has **no `window.prompt`**, and browser modal dialogs are forbidden. Implement rename as an **inline edit**: when the ✎ is clicked, set a local `renamingId` state and render an uncontrolled `<textarea rows={1}>`/`<input>`-style textarea seeded with `c.title`; on Enter/blur dispatch `chatRenamed({ id, title })`. Replace the placeholder ✎ handler above with this inline-rename pattern (mirror the `EditBody` approach from Task 4: `useDraftField(c.title)`, a small Save/Cancel). Do not ship the placeholder handler.

- [ ] **Step 2: Implement inline rename (replace the ✎ placeholder)**

Add a `renamingId` state to `Sessions` and a small inline editor row. Concretely: `const [renamingId, setRenamingId] = useState<string | null>(null);` When `renamingId === c.id`, render (instead of the title button) a textarea seeded via `useDraftField(c.title)` with Save (→ `chatRenamed({ id: c.id, title: value.trim() || c.title })` then `setRenamingId(null)`) and Cancel (`setRenamingId(null)`); the ✎ button sets `renamingId = c.id`. Factor the inline editor into a local `RenameRow` sub-component so `useDraftField` is called unconditionally (hooks must not be conditional).

- [ ] **Step 3: Render `<Sessions>` in `Chat.tsx`**

Replace the `showSessions` placeholder block with:

```tsx
if (showSessions) {
  return <Sessions onBack={() => setShowSessions(false)} />;
}
```

Add `import { Sessions } from "./Sessions";` to `Chat.tsx`.

- [ ] **Step 4: Typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: tsc exits 0; build succeeds.

- [ ] **Step 5: Manual verification (reload; Chat tab → folder)**

- Sessions view lists all chats with the active one highlighted.
- **New** creates a brainstorm and returns to it.
- Clicking a row switches to that chat and returns to the chat view.
- **✎** inline-renames (Save persists, Cancel discards).
- **Trash** deletes (the last remaining chat cannot be deleted — the slice guards `chats.length <= 1`; verify no crash).

- [ ] **Step 6: Commit**

```bash
git add src/ui-jsx/panels/chat/Sessions.tsx src/ui-jsx/panels/chat/Chat.tsx
git commit -m "feat(jsx): in-panel sessions view (new/switch/rename/delete)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Refine loop — adaptive Foundation zap + RefineCommitBar

**Files:**

- Create: `src/ui-jsx/panels/chat/RefineCommitBar.tsx`
- Modify: `src/ui-jsx/panels/chat/Chat.tsx` (show `<RefineCommitBar>` for refine chats)
- Modify: `src/ui-jsx/panels/Foundation.tsx` (adaptive zap: empty → generate, non-empty → `uiChatRefineRequested`)
- Modify: `CHANGELOG.md`

**Interfaces:**

- Consumes: `decideFieldAction` (`./chat-actions`); `uiChatRefineRequested`, `uiChatRefineCommitted`, `uiChatRefineDiscarded`, `activeSavedChat`, `store` from core; existing `attgGenerationRequested`/`styleGenerationRequested` in Foundation.
- Produces: `RefineCommitBar(): VNode` — Commit / Discard bar for refine chats. Foundation's ATTG/Style zap becomes adaptive.

- [ ] **Step 1: Create `RefineCommitBar.tsx`**

```tsx
// src/ui-jsx/panels/chat/RefineCommitBar.tsx
import { T, SP } from "../../style";
import {
  store,
  uiChatRefineCommitted,
  uiChatRefineDiscarded,
} from "../../../core/store";

export function RefineCommitBar() {
  return (
    <div
      style={{
        display: "flex",
        gap: SP.sm,
        padding: SP.md,
        borderTop: `1px solid ${T.bg2}`,
      }}
    >
      <button
        style={{ flex: 1, padding: "6px", color: T.midIntensity }}
        onClick={() => store.dispatch(uiChatRefineCommitted())}
      >
        Commit
      </button>
      <button
        style={{ flex: 1, padding: "6px", color: T.warning }}
        onClick={() => store.dispatch(uiChatRefineDiscarded())}
      >
        Discard
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Show the commit bar for refine chats in `Chat.tsx`**

In `Chat.tsx`, after `<ChatInput />`, conditionally render the bar:

```tsx
import { RefineCommitBar } from "./RefineCommitBar";
// ...
<ChatInput />;
{
  chat.type === "refine" && <RefineCommitBar />;
}
```

- [ ] **Step 3: Make the Foundation zap adaptive**

In `src/ui-jsx/panels/Foundation.tsx`, import the helper and action:

```tsx
import { decideFieldAction } from "./chat/chat-actions";
import {
  // ...existing imports...
  uiChatRefineRequested,
} from "../../core/store";
```

Change the two `onGenerate` handlers on the `FieldCard`s. Replace:

```tsx
        onGenerate={() => store.dispatch(attgGenerationRequested())}
```

with a small adaptive handler (add a helper near the top of the module):

```tsx
function runFieldZap(
  fieldId: "attg" | "style",
  text: string,
  generate: () => void,
): void {
  if (decideFieldAction(text) === "generate") {
    generate();
  } else {
    store.dispatch(uiChatRefineRequested({ fieldId, sourceText: text }));
  }
}
```

ATTG card:

```tsx
        onGenerate={() =>
          runFieldZap("attg", attg, () => store.dispatch(attgGenerationRequested()))
        }
```

Style card:

```tsx
        onGenerate={() =>
          runFieldZap("style", style, () => store.dispatch(styleGenerationRequested()))
        }
```

(`attg` and `style` are already read via `useSlice` at the top of `Foundation()`.)

- [ ] **Step 4: Typecheck, build, full test suite**

Run: `npx tsc --noEmit && npm run build && npm run test`
Expected: tsc 0; build succeeds; tests pass (384 + the Task 1 additions).

- [ ] **Step 5: Manual verification (reload) — the full refine loop**

1. Story Engine tab: ensure ATTG has content. Click its **⚡**.
2. The panel switches to the **Chat** tab showing a refine chat titled "Refining: …", with a collapsed **Context** bubble seeding the current ATTG text, a **Back** + **folder** header, the composer, and a **Commit / Discard** bar.
3. Type a change instruction, Send → an assistant rewrite streams as a candidate.
4. **Commit** → the ATTG field updates to the rewrite and the panel returns to the **Story Engine** tab.
5. Repeat; this time **Discard** → the field is unchanged and the panel returns to Story Engine.
6. On an **empty** field, **⚡** still generates (no refine chat).
7. Compare the whole loop against the SUI Chat tab for parity.

- [ ] **Step 6: Update `CHANGELOG.md`**

Add to the existing `[0.14.0]` `### Added` list:

```markdown
- **Experimental JSX panel gains a Chat tab.** The JSX panel now has Chat | Story Engine tabs. The Chat tab hosts brainstorm and refine chats through the same shared chat engine as the SUI panel — send/stream/edit/retry/delete messages, switch sub-mode (Co/Crit), summarize, manage sessions (new/switch/rename/delete), and refine a Foundation field end-to-end (its ⚡ opens a refine when the field has content; Commit writes the rewrite back). Forge in the JSX chat comes later.
```

- [ ] **Step 7: Commit**

```bash
git add src/ui-jsx/panels/chat/RefineCommitBar.tsx src/ui-jsx/panels/chat/Chat.tsx src/ui-jsx/panels/Foundation.tsx CHANGELOG.md
git commit -m "feat(jsx): refine loop — adaptive Foundation zap + refine commit bar

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**

- Panel tab shell + store-driven switching → Task 2. ✓
- Chat shell (header + list + input + optional commit bar) → Tasks 3, 5, 7. ✓
- ChatHeader polymorphic controls → Task 5. ✓
- Message bubbles + edit/retry/delete + system Context collapse → Tasks 3, 4. ✓
- ChatInput spec-customized + send handoff → Task 3. ✓
- Sessions in-panel → Task 6. ✓
- RefineCommitBar → Task 7. ✓
- Adaptive Foundation zap / refine wiring → Tasks 1, 7. ✓
- Testing (pure helpers vitest + manual parity) → Task 1 vitest; manual steps each task. ✓
- Out of scope (forge, entity cards, markdown, modal) → not implemented; forge-only header kinds no-op in Task 5. ✓

**Placeholder scan:** The only intentional "coming next task" placeholders (Chat tab in Task 2, Sessions in Task 5) are replaced in Tasks 3 and 6 respectively. The `Sessions.tsx` ✎ handler in Task 6 Step 1 is explicitly flagged as a placeholder to be replaced in Step 2 (inline rename) — do not ship it.

**Type consistency:** `Chat` component signature evolves once (Task 3 no props → Task 5 `{ onBack }`); App is updated in the same task. `decideFieldAction`/`nextBrainstormTitle`/`CHAT_INPUT_KEY` names are consistent across Tasks 1, 3, 5, 6, 7. Action names (`uiChatSubmitUserMessage`, `uiChatRefineRequested`, `uiChatRefineCommitted`, `uiChatRefineDiscarded`, `messageUpdated`, `messageRemoved`, `uiChatRetryGeneration`, `subModeChanged`, `uiChatSummarizeRequested`, `chatCreated`, `chatSwitched`, `chatRenamed`, `chatDeleted`) match the confirmed barrel exports from `../core/store`.

**Icons:** all icons come from the nibs-provided `nai:icons/feather` virtual module (tree-shaken at build); the plan trusts its generated types like any typed import — a wrong PascalCase name fails `tsc`, so no manual verification step is needed.
