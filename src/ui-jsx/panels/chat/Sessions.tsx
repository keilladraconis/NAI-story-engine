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

function rowStyle(active: boolean) {
  return {
    display: "flex",
    alignItems: "center",
    gap: SP.sm,
    padding: SP.sm,
    background: active ? T.bg2 : "transparent",
    borderRadius: "4px",
  };
}

// A row in rename mode: uncontrolled textarea (seeded via child text, read via
// ref on save) + Save / Cancel. Rendered as a full row and keyed by chat id at
// the map's top level so switching to/from SessionRow is a clean same-slot swap.
function RenameRow(props: { c: ChatT; active: boolean; onDone: () => void }) {
  const taRef = useRef<{ value: string } | null>(null);
  const save = () => {
    const raw = taRef.current?.value ?? props.c.title;
    const title = raw.replace(/\s+/g, " ").trim() || props.c.title;
    store.dispatch(chatRenamed({ id: props.c.id, title }));
    props.onDone();
  };
  return (
    <div style={rowStyle(props.active)}>
      <textarea
        ref={taRef}
        rows={1}
        onKeyDown={(e) => {
          if (e.key === "Escape") props.onDone();
        }}
        style={{
          flex: 1,
          background: T.bg2,
          border: "none",
          color: T.text,
          fontFamily: T.fontDefault,
          padding: SP.sm,
          borderRadius: "4px",
          resize: "none",
        }}
      >
        {props.c.title}
      </textarea>
      <button style={iconBtn} title="Save" onClick={save}>
        ✓
      </button>
      <button style={iconBtn} title="Cancel" onClick={props.onDone}>
        ✗
      </button>
    </div>
  );
}

// A normal row: switch (title) + rename + delete. Delete is hidden when there is
// only one chat (the lone chat cannot be deleted — the slice guards length<=1).
function SessionRow(props: {
  c: ChatT;
  active: boolean;
  canDelete: boolean;
  onSwitch: () => void;
  onRename: () => void;
}) {
  return (
    <div style={rowStyle(props.active)}>
      <button
        style={{ ...iconBtn, flex: 1, justifyContent: "flex-start" }}
        onClick={props.onSwitch}
      >
        {props.c.title}
      </button>
      <button style={iconBtn} title="Rename" onClick={props.onRename}>
        ✎
      </button>
      {props.canDelete && (
        <button
          style={iconBtn}
          title="Delete"
          onClick={() => store.dispatch(chatDeleted({ id: props.c.id }))}
        >
          <Trash size={ICON} />
        </button>
      )}
    </div>
  );
}

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
  const canDelete = chats.length > 1;

  const [renamingId, setRenamingId] = useState<string | null>(null);

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
        {chats.map((c) =>
          renamingId === c.id ? (
            <RenameRow
              key={c.id}
              c={c}
              active={c.id === activeId}
              onDone={() => setRenamingId(null)}
            />
          ) : (
            <SessionRow
              key={c.id}
              c={c}
              active={c.id === activeId}
              canDelete={canDelete}
              onSwitch={() => {
                store.dispatch(chatSwitched({ id: c.id }));
                props.onBack();
              }}
              onRename={() => setRenamingId(c.id)}
            />
          ),
        )}
      </div>
    </div>
  );
}
