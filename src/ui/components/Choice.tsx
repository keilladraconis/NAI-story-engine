// One pickable option: a facilitator round's answer, a vignette offer. Picked
// shows a ✓ as well as the border, so the state never rests on colour alone.

import { SP, T, TOUCH } from "../style";

export function Choice(props: {
  label: string;
  description: string;
  picked: boolean;
  /** Only a live choice takes picks; an old round's stay as a record. */
  live: boolean;
  onPick: () => void;
}) {
  const { picked, live } = props;
  return (
    <button
      aria-pressed={picked}
      disabled={!live}
      onClick={props.onPick}
      style={{
        flex: "1 1 140px",
        minHeight: TOUCH,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: SP.xs,
        padding: "6px 10px",
        borderRadius: "8px",
        border: `1px solid ${picked ? T.textHeadings : T.bg3}`,
        background: picked ? T.bg3 : T.bg1,
        color: T.text,
        font: "inherit",
        textAlign: "left",
        cursor: live ? "pointer" : "default",
        opacity: live || picked ? 1 : 0.6,
      }}
    >
      <span style={{ fontWeight: "bold" }}>
        {picked ? `✓ ${props.label}` : props.label}
      </span>
      <span
        style={{
          display: props.description ? "block" : "none",
          fontSize: "0.8em",
          opacity: 0.75,
          lineHeight: 1.35,
        }}
      >
        {props.description}
      </span>
    </button>
  );
}
