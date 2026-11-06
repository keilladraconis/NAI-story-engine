// Small building blocks shared by the sidebar stages. Everything wraps: there
// are no media queries, so one layout serves a phone and a desktop.

import { DENSE, SP, T, TOUCH } from "../style";

type Tone = "primary" | "plain" | "quiet";

export function Button(props: {
  onClick: () => void;
  children: preact.ComponentChildren;
  tone?: Tone;
  dense?: boolean;
  disabled?: boolean;
  title?: string;
  grow?: boolean;
}) {
  const tone = props.tone ?? "plain";
  return (
    <button
      title={props.title}
      disabled={props.disabled}
      onClick={props.onClick}
      style={{
        minHeight: props.dense ? DENSE : TOUCH,
        padding: "0 12px",
        flex: props.grow ? "1 1 auto" : "0 0 auto",
        borderRadius: "6px",
        border: tone === "plain" ? `1px solid ${T.bg3}` : "none",
        background:
          tone === "primary"
            ? T.textHeadings
            : tone === "plain"
              ? T.bg2
              : "transparent",
        color: tone === "primary" ? T.bg : T.text,
        fontWeight: tone === "primary" ? "bold" : "normal",
        font: "inherit",
        cursor: props.disabled ? "default" : "pointer",
        opacity: props.disabled ? 0.5 : 1,
      }}
    >
      {props.children}
    </button>
  );
}

export function Row(props: {
  children: preact.ComponentChildren;
  gap?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: props.gap ?? SP.md,
      }}
    >
      {props.children}
    </div>
  );
}

export function SectionTitle(props: { children: preact.ComponentChildren }) {
  return (
    <h2
      style={{
        margin: `${SP.md} 0 ${SP.sm}`,
        fontSize: "0.75em",
        fontWeight: "bold",
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        opacity: 0.75,
      }}
    >
      {props.children}
    </h2>
  );
}

export function Hint(props: { children: preact.ComponentChildren }) {
  return (
    <p
      style={{
        margin: `0 0 ${SP.md}`,
        fontSize: "0.85em",
        opacity: 0.75,
        lineHeight: 1.5,
      }}
    >
      {props.children}
    </p>
  );
}

/**
 * A text field that tracks typing locally and commits on blur: the store is
 * not touched per keystroke. `value` re-seeds the field when the stored value
 * changes from elsewhere (a facilitator update, a GLM rewrite).
 */
export function Field(props: {
  label: string;
  value: string;
  onCommit: (value: string) => void;
  multiline?: boolean;
  rows?: number;
  placeholder?: string;
}) {
  const [text, setText] = useState(props.value);
  useEffect(() => setText(props.value), [props.value]);
  const commit = () => {
    if (text !== props.value) props.onCommit(text);
  };
  const style = {
    width: "100%",
    boxSizing: "border-box",
    minHeight: props.multiline ? undefined : DENSE,
    padding: "6px 8px",
    borderRadius: "6px",
    border: `1px solid ${T.bg3}`,
    background: T.bg,
    color: T.text,
    font: "inherit",
    lineHeight: 1.45,
    resize: "vertical",
  } as const;
  return (
    <label
      style={{
        display: "flex",
        flexDirection: "column",
        gap: SP.xs,
        marginBottom: SP.md,
      }}
    >
      <span style={{ fontSize: "0.8em", opacity: 0.75 }}>{props.label}</span>
      {props.multiline ? (
        <textarea
          rows={props.rows ?? 3}
          value={text}
          placeholder={props.placeholder}
          onInput={(e) => setText(e.currentTarget.value ?? "")}
          onBlur={commit}
          style={style}
        />
      ) : (
        <input
          type="text"
          value={text}
          placeholder={props.placeholder}
          onInput={(e) => setText(e.currentTarget.value ?? "")}
          onBlur={commit}
          style={style}
        />
      )}
    </label>
  );
}

/** The scrolling body every stage sits in. */
export function StageBody(props: { children: preact.ComponentChildren }) {
  return (
    <div
      style={{
        padding: `${SP.md} 12px ${SP.lg}`,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {props.children}
    </div>
  );
}

/** A status word with its own colour and text, never colour alone. */
export function Status(props: {
  tone: "good" | "warn" | "cool" | "dim";
  children: string;
}) {
  const color =
    props.tone === "good"
      ? T.good
      : props.tone === "warn"
        ? T.warning
        : props.tone === "cool"
          ? T.cool
          : T.textDisabled;
  return (
    <span style={{ fontSize: "0.78em", color, whiteSpace: "nowrap" }}>
      {props.children}
    </span>
  );
}
