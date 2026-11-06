// The Talk tab's chat. Laid out like the old chat: a `column-reverse` list, so
// the newest message sits at the bottom and the scroll stays pinned there as
// turns arrive with no scroll code, and the composer pinned under it.
//
// The chat is a working conversation, not a record: no per-message actions.
// Keep talking, or Clear it to start anew; the Brief holds what was settled.

import { store, chatCleared, stageOpened } from "../../core/store";
import { talk, interviewDone } from "../../core/facilitator";
import { useSlice, useStream } from "../bridge";
import { SP, T, SCROLL } from "../style";
import { Button, Row } from "../components/kit";
import { ConfirmButton } from "../components/ConfirmButton";
/** Messages shown at once; Show more reveals this many more. */
export const PAGE = 25;

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
        display: "flex",
        flexDirection: "column",
        alignItems: mine ? "flex-end" : "flex-start",
      }}
    >
      <div
        style={{
          maxWidth: "88%",
          padding: "8px 10px",
          borderRadius: mine ? "12px 12px 0 12px" : "12px 12px 12px 0",
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

export function Facilitator() {
  const ids = useSlice((s) => s.chat.messages.map((m) => m.id).join(","));
  const busy = useSlice((s) => s.runtime.jobs.length > 0);
  const done = useSlice((s) => interviewDone(s.canon.brief));
  const [text, setText] = useState("");
  const count = ids ? ids.split(",").length : 0;
  // How many of the newest messages are shown. A new message (or a cleared
  // chat) brings the horizon back to one page.
  const [shown, setShown] = useState(PAGE);
  useEffect(() => setShown(PAGE), [count]);

  const send = () => {
    const said = text.trim();
    if (!said) return;
    setText("");
    void talk(said);
  };

  const list = ids ? ids.split(",") : [];
  // Newest first, because the column is reversed. Keyed by index: keyed
  // reconciliation scrambled the order on the insert-at-front each new
  // message causes; index keys patch positionally (as the old chat found).
  const reversed = list.slice().reverse().slice(0, shown);
  const hidden = count - reversed.length;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
      }}
    >
      <div
        role="log"
        aria-label="Conversation"
        style={{
          flex: 1,
          minHeight: 0,
          ...SCROLL,
          display: "flex",
          flexDirection: "column-reverse",
          justifyContent: "flex-start",
          gap: "10px",
          padding: `${SP.md} 12px`,
        }}
      >
        <div style={{ display: ids && done && !busy ? "flex" : "none" }}>
          <Button
            tone="primary"
            onClick={() => store.dispatch(stageOpened({ stage: "vignettes" }))}
          >
            Go to Vignettes
          </Button>
        </div>
        {reversed.map((id, i) => (
          <Bubble key={i} id={id} />
        ))}
        <div
          style={{
            display: hidden > 0 ? "flex" : "none",
            justifyContent: "center",
          }}
        >
          <Button dense tone="quiet" onClick={() => setShown(shown + PAGE)}>
            {`Show ${Math.min(PAGE, hidden)} more`}
          </Button>
        </div>
        <p
          style={{
            display: ids ? "none" : "block",
            margin: 0,
            lineHeight: 1.5,
            opacity: 0.75,
          }}
        >
          Start with whatever you have: a premise, a character, a feeling, five
          words. The facilitator works it into a scenario with you and keeps the
          Brief as you go.
        </p>
      </div>
      <div
        style={{
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          gap: SP.sm,
          padding: `${SP.sm} 12px ${SP.md}`,
          borderTop: `1px solid ${T.bg3}`,
        }}
      >
        <textarea
          aria-label="Message"
          rows={3}
          value={text}
          placeholder={
            !ids
              ? "Describe the scenario you want to build."
              : done
                ? "Anything to change? The Brief updates as you talk."
                : "Reply…"
          }
          onInput={(e) => setText(e.currentTarget.value ?? "")}
          style={{
            width: "100%",
            boxSizing: "border-box",
            minHeight: "60px",
            maxHeight: "140px",
            padding: "8px",
            borderRadius: "6px",
            border: "none",
            background: T.bg2,
            color: T.text,
            font: "inherit",
            resize: "vertical",
            scrollbarWidth: SCROLL.scrollbarWidth,
            scrollbarColor: SCROLL.scrollbarColor,
          }}
        />
        <Row>
          <Button tone="primary" onClick={send} disabled={busy}>
            Send
          </Button>
          <span style={{ flex: 1 }} />
          <div style={{ display: ids ? "block" : "none" }}>
            <ConfirmButton
              title="Clear the conversation (the Brief is kept)"
              label="Clear"
              onConfirm={() => store.dispatch(chatCleared())}
            />
          </div>
        </Row>
      </div>
    </div>
  );
}
