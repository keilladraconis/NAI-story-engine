// The facilitator interview: one question at a time until the Brief is
// complete, then a read-back and a pointer to Vignettes.

import { store, chatCleared, stageOpened } from "../../core/store";
import { talk, interviewDone } from "../../core/facilitator";
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
  );
}

export function Facilitator() {
  const ids = useSlice((s) => s.chat.messages.map((m) => m.id).join(","));
  const busy = useSlice((s) => s.runtime.jobs.length > 0);
  const done = useSlice((s) => interviewDone(s.canon.brief));
  const [text, setText] = useState("");

  const send = () => {
    const said = text.trim();
    if (!said) return;
    setText("");
    void talk(said);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SP.md }}>
      <div
        style={{
          display: ids ? "none" : "flex",
          flexDirection: "column",
          gap: SP.md,
        }}
      >
        <p style={{ margin: 0, lineHeight: 1.5 }}>
          The facilitator asks one question at a time until the brief is filled
          in: premise, voice, genre, heat, pace and limits. Answer briefly; it
          offers options when you are not sure.
        </p>
        <Row>
          <Button tone="primary" disabled={busy} onClick={() => void talk("")}>
            Start
          </Button>
        </Row>
      </div>
      <div
        role="log"
        aria-label="Facilitator conversation"
        style={{ display: "flex", flexDirection: "column", gap: SP.md }}
      >
        {(ids ? ids.split(",") : []).map((id) => (
          <Bubble key={id} id={id} />
        ))}
      </div>
      <div style={{ display: ids && done && !busy ? "flex" : "none" }}>
        <Button
          tone="primary"
          onClick={() => store.dispatch(stageOpened({ stage: "vignettes" }))}
        >
          Go to Vignettes
        </Button>
      </div>
      <textarea
        aria-label="Answer"
        rows={3}
        value={text}
        placeholder={
          done
            ? "Anything to change? The brief updates as you answer."
            : "Answer…"
        }
        onInput={(e) => setText(e.currentTarget.value ?? "")}
        style={{
          display: ids ? "block" : "none",
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
      <div style={{ display: ids ? "block" : "none" }}>
        <Row>
          <Button tone="primary" onClick={send} disabled={busy}>
            Send
          </Button>
          <span style={{ flex: 1 }} />
          <ConfirmButton
            title="Start the interview over (the brief is kept)"
            label="Start over"
            onConfirm={() => store.dispatch(chatCleared())}
          />
        </Row>
      </div>
    </div>
  );
}
