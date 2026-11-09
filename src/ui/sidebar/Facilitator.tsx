// The Talk tab's chat. Laid out like the old chat: a `column-reverse` list, so
// the newest message sits at the bottom and the scroll stays pinned there as
// turns arrive with no scroll code, and the composer pinned under it.
//
// The chat is a working conversation, not a record: no per-message actions.
// Keep talking, or Clear it to start anew; the Brief holds what was settled.
//
// The facilitator asks in rounds of multiple-choice questions. Only the
// newest round takes picks; Send answers it with the picks and anything typed.

import {
  store,
  chatCleared,
  stageOpened,
  optionPicked,
} from "../../core/store";
import { talk, interviewDone, answerText } from "../../core/facilitator";
import { useSlice, useStream } from "../bridge";
import { SP, T, SCROLL } from "../style";
import { Button, Row } from "../components/kit";
import { ConfirmButton } from "../components/ConfirmButton";
import { Choice } from "../components/Choice";
/** Messages shown at once; Show more reveals this many more. */
export const PAGE = 25;

/** A round's questions, each with its options as wrapping choices. */
function Round(props: { id: string; live: boolean }) {
  const message = useSlice((s) =>
    s.chat.messages.find((m) => m.id === props.id),
  );
  const questions = message?.questions ?? [];
  return (
    <div
      style={{
        display: questions.length ? "flex" : "none",
        flexDirection: "column",
        gap: SP.lg,
        width: "100%",
        whiteSpace: "normal",
      }}
    >
      {questions.map((q, i) => (
        <div
          key={i}
          role="group"
          aria-label={q.header}
          style={{ display: "flex", flexDirection: "column", gap: SP.sm }}
        >
          <div style={{ lineHeight: 1.4 }}>
            <span
              style={{
                display: "block",
                fontSize: "0.75em",
                fontWeight: "bold",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                opacity: 0.75,
              }}
            >
              {q.multi ? `${q.header} · pick any` : q.header}
            </span>
            {q.question}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: SP.sm }}>
            {q.options.map((o, j) => (
              <Choice
                key={j}
                label={o.label}
                description={o.description}
                picked={message?.picks?.[i]?.includes(o.label) ?? false}
                live={props.live}
                onPick={() =>
                  store.dispatch(
                    optionPicked({ id: props.id, question: i, label: o.label }),
                  )
                }
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Bubble(props: { id: string; live: boolean }) {
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
          maxWidth: message.questions?.length ? "100%" : "88%",
          display: "flex",
          flexDirection: "column",
          gap: SP.md,
          padding: "8px 10px",
          borderRadius: mine ? "12px 12px 0 12px" : "12px 12px 12px 0",
          background: mine ? T.bg3 : T.bg2,
          lineHeight: 1.5,
          whiteSpace: "pre-wrap",
          userSelect: "text",
        }}
      >
        <span
          style={{
            display: text || !message.questions?.length ? "inline" : "none",
          }}
        >
          {text || "…"}
        </span>
        <Round id={props.id} live={props.live} />
      </div>
    </div>
  );
}

export function Facilitator() {
  const ids = useSlice((s) => s.chat.messages.map((m) => m.id).join(","));
  const busy = useSlice((s) => s.runtime.jobs.length > 0);
  const done = useSlice((s) => interviewDone(s.canon.brief));
  // The newest message, when it is a round still waiting for its answer.
  const liveRound = useSlice((s) => {
    const last = s.chat.messages[s.chat.messages.length - 1];
    return last?.questions?.length ? last.id : "";
  });
  const answer = useSlice((s) =>
    answerText(s.chat.messages.find((m) => m.id === liveRound)),
  );
  const [text, setText] = useState("");
  const count = ids ? ids.split(",").length : 0;
  // How many of the newest messages are shown. A new message (or a cleared
  // chat) brings the horizon back to one page.
  const [shown, setShown] = useState(PAGE);
  useEffect(() => setShown(PAGE), [count]);

  const send = () => {
    const said = [answer, text.trim()].filter(Boolean).join("\n\n");
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
          <Bubble key={i} id={id} live={id === liveRound && !busy} />
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
          words. The facilitator asks a few rounds of questions to pick from,
          and keeps the Brief as you go.
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
                : liveRound
                  ? "Pick above, and add anything in your own words."
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
            {answer ? "Answer" : "Send"}
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
