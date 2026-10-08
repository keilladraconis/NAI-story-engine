// src/ui/panels/chat/BuildPills.tsx
import { T, SP } from "../../style";
import type { Pill } from "../../../core/chat-types/pills";

const TONE = {
  thinking: {
    color: T.text,
    opacity: 0.55,
    borderColor: "rgba(255,255,255,0.18)",
  },
  applied: { color: T.text, opacity: 1, borderColor: "rgba(255,255,255,0.3)" },
  rejected: { color: T.warning, opacity: 1, borderColor: T.warning },
} as const;

const NONE: Record<number, boolean> = {};

/** A Build reply as a wrapping row of pills, each opening its body under the
 *  row. Every body is mounted once and its `display` toggled: a pill opened
 *  and closed by swapping elements leaves stale ones behind in this renderer.
 *  The open set is held with the `resetKey` it belongs to, so an instance
 *  reused for another message (the message list is keyed by index and pages)
 *  shows nothing open in that same render, without an effect to reset it. */
export function BuildPills(props: {
  pills: Pill[];
  resetKey: string;
  hidden: boolean;
}) {
  const [held, setHeld] = useState({ key: props.resetKey, open: NONE });
  const open = held.key === props.resetKey ? held.open : NONE;

  return (
    <div
      style={{
        display: props.hidden ? "none" : "flex",
        flexDirection: "column",
        gap: SP.xs,
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: SP.xs }}>
        {props.pills.map((pill, i) => (
          <button
            key={i}
            title={pill.body.length > 0 ? "Show what it said" : undefined}
            onClick={() => {
              if (pill.body.length === 0) return;
              setHeld((h) => {
                const was = h.key === props.resetKey ? h.open : NONE;
                return { key: props.resetKey, open: { ...was, [i]: !was[i] } };
              });
            }}
            style={{
              background: open[i] ? "rgba(255,255,255,0.08)" : "none",
              border: `1px solid ${TONE[pill.tone].borderColor}`,
              borderRadius: "10px",
              color: TONE[pill.tone].color,
              opacity: TONE[pill.tone].opacity,
              cursor: pill.body.length > 0 ? "pointer" : "default",
              fontFamily: T.fontDefault,
              fontSize: "0.75em",
              padding: "1px 7px",
              textDecoration:
                pill.tone === "rejected" ? "line-through" : "none",
            }}
          >
            [{pill.label}]
          </button>
        ))}
      </div>
      {props.pills.map((pill, i) => (
        <div
          key={i}
          style={{
            display: open[i] && pill.body.length > 0 ? "block" : "none",
            borderLeft: `2px solid ${TONE[pill.tone].borderColor}`,
            paddingLeft: SP.sm,
            fontSize: "0.85em",
            whiteSpace: "pre-wrap",
          }}
        >
          {pill.body.map((part, j) => (
            <div key={j} style={{ marginBottom: SP.xs }}>
              <span
                style={{
                  display: part.label ? "inline" : "none",
                  opacity: 0.6,
                }}
              >
                {part.label}:{" "}
              </span>
              {part.text}
              <div
                style={{
                  display: part.unseen ? "block" : "none",
                  fontSize: "0.8em",
                  opacity: 0.5,
                }}
              >
                Never shown to the story model.
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
