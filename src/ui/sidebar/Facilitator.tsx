// The facilitator chat, shared by the Brief and Cast stages: one transcript.

import { store, chatCleared } from "../../core/store";
import { talk, updateBrief } from "../../core/facilitator";
import { useSlice, useStream } from "../bridge";
import { SP, T } from "../style";
import { Button, Row } from "../components/kit";
import { ConfirmButton } from "../components/ConfirmButton";

function Bubble(props: { id: string }) {
  const message = useSlice((s) =>
    s.chat.messages.find((m) => m.id === props.id),
  );
  const streaming = useStream(props.id);
  if (!message) return null;
  const mine = message.role === "user";
  const text = streaming ?? message.content;
  return (
    <div
      style={{
        alignSelf: mine ? "flex-end" : "flex-start",
        maxWidth: "88%",
        display: "flex",
        flexDirection: "column",
        gap: SP.xs,
      }}
    >
      {mine ? null : (
        <span style={{ fontSize: "0.75em", fontWeight: "bold", opacity: 0.7 }}>
          Facilitator
        </span>
      )}
      <div
        style={{
          padding: "8px 10px",
          borderRadius: "10px",
          background: mine ? T.bg3 : T.bg2,
          lineHeight: 1.5,
          whiteSpace: "pre-wrap",
          userSelect: "text",
        }}
      >
        {text || "…"}
      </div>
    </div>
  );
}

export function Facilitator(props: { stage: "brief" | "cast" }) {
  const ids = useSlice((s) => s.chat.messages.map((m) => m.id).join(","));
  const busy = useSlice((s) => s.runtime.jobs.length > 0);
  const [text, setText] = useState("");

  const send = () => {
    const said = text.trim();
    if (!said) return;
    setText("");
    void talk(said, props.stage);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SP.md }}>
      <div
        role="log"
        aria-label="Facilitator conversation"
        style={{ display: "flex", flexDirection: "column", gap: SP.md }}
      >
        <span
          style={{
            display: ids ? "none" : "inline",
            fontSize: "0.85em",
            opacity: 0.7,
          }}
        >
          Tell the facilitator what you have in mind; it asks what the scenario
          still needs.
        </span>
        {(ids ? ids.split(",") : []).map((id) => (
          <Bubble key={id} id={id} />
        ))}
      </div>
      <textarea
        aria-label="Message to the facilitator"
        rows={3}
        value={text}
        placeholder="Reply…"
        onInput={(e) => setText(e.currentTarget.value ?? "")}
        style={{
          width: "100%",
          boxSizing: "border-box",
          padding: "8px",
          borderRadius: "6px",
          border: `1px solid ${T.bg3}`,
          background: T.bg,
          color: T.text,
          font: "inherit",
          resize: "vertical",
        }}
      />
      <Row>
        <Button tone="primary" onClick={send} disabled={busy}>
          Send
        </Button>
        <Button onClick={() => void updateBrief()} disabled={busy || !ids}>
          Update brief
        </Button>
        <span style={{ flex: 1 }} />
        <ConfirmButton
          title="Clear the conversation"
          label="Clear"
          onConfirm={() => store.dispatch(chatCleared())}
        />
      </Row>
    </div>
  );
}
