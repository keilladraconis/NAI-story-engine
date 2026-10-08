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

/** A Build reply as a wrapping row of pills. A pill opens in place: it widens
 *  to the full row and shows its body inside its own border. Every body is
 *  mounted once and its `display` toggled: a pill opened and closed by
 *  swapping elements leaves stale ones behind in this renderer. The open set
 *  is held with the `resetKey` it belongs to, so an instance reused for
 *  another message (the message list is keyed by index and pages) shows
 *  nothing open in that same render, without an effect to reset it. */
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
        flexWrap: "wrap",
        alignItems: "flex-start",
        gap: SP.xs,
      }}
    >
      {props.pills.map((pill, i) => {
        const opens = pill.body.length > 0;
        const isOpen = opens && !!open[i];
        return (
          <div
            key={i}
            style={{
              width: isOpen ? "100%" : "auto",
              border: `1px solid ${TONE[pill.tone].borderColor}`,
              borderRadius: "10px",
              background: isOpen ? "rgba(255,255,255,0.05)" : "none",
              opacity: isOpen ? 1 : TONE[pill.tone].opacity,
            }}
          >
            <button
              title={opens ? "Show what it said" : undefined}
              onClick={() => {
                if (!opens) return;
                setHeld((h) => {
                  const was = h.key === props.resetKey ? h.open : NONE;
                  return {
                    key: props.resetKey,
                    open: { ...was, [i]: !was[i] },
                  };
                });
              }}
              style={{
                background: "none",
                border: "none",
                color: TONE[pill.tone].color,
                cursor: opens ? "pointer" : "default",
                fontFamily: T.fontDefault,
                fontSize: "0.75em",
                padding: "1px 7px",
                textAlign: "left",
                textDecoration:
                  pill.tone === "rejected" ? "line-through" : "none",
              }}
            >
              [{pill.label}]
            </button>
            <div
              style={{
                display: isOpen ? "block" : "none",
                padding: `0 7px ${SP.xs}`,
                fontSize: "0.85em",
                whiteSpace: "pre-wrap",
              }}
            >
              {pill.body.map((part, j) => (
                <div key={j} style={{ marginTop: SP.xs }}>
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
          </div>
        );
      })}
    </div>
  );
}
