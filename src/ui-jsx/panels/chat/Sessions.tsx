// src/ui-jsx/panels/chat/Sessions.tsx
import { useSlice } from "../../bridge";
import { useDraftField } from "../../hooks";
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

interface RenameRowProps {
  c: ChatT;
  onDone: () => void;
}

function RenameRow({ c, onDone }: RenameRowProps) {
  // Uncontrolled: seed display from child text (the renderer applies `value`
  // via setAttribute, which text fields ignore); track edits via onInput. Sanit-
  // ize any stray newline so a single-line title stays single-line.
  const { value, setValue } = useDraftField(c.title);

  const save = () => {
    const title = value.replace(/\s+/g, " ").trim() || c.title;
    store.dispatch(chatRenamed({ id: c.id, title }));
    onDone();
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: SP.sm, flex: 1 }}>
      <textarea
        rows={1}
        onInput={(e) => setValue(e.target.value ?? "")}
        onKeyDown={(e) => {
          if (e.key === "Escape") onDone();
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
        {c.title}
      </textarea>
      <button style={iconBtn} title="Save" onClick={save}>
        ✓
      </button>
      <button style={iconBtn} title="Cancel" onClick={onDone}>
        ✗
      </button>
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
        <span
          style={{
            flex: 1,
            color: T.textHeadings,
            fontWeight: "bold",
          }}
        >
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
            {renamingId === c.id ? (
              <RenameRow c={c} onDone={() => setRenamingId(null)} />
            ) : (
              <button
                style={{ ...iconBtn, flex: 1, justifyContent: "flex-start" }}
                onClick={() => {
                  store.dispatch(chatSwitched({ id: c.id }));
                  props.onBack();
                }}
              >
                {c.title}
              </button>
            )}
            <button
              style={iconBtn}
              title="Rename"
              onClick={() => setRenamingId(c.id)}
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
