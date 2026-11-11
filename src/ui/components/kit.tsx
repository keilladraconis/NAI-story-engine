// Small building blocks shared by the sidebar stages. Everything wraps: there
// are no media queries, so one layout serves a phone and a desktop.

import { DENSE, SCROLL, SP, T, TOUCH } from "../style";

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

/** A small rounded label: a status or a kind. Its text carries the meaning. */
export function Pill(props: {
  children: string;
  tone?: "good" | "warn" | "cool" | "dim";
}) {
  const color =
    props.tone === "good"
      ? T.good
      : props.tone === "warn"
        ? T.warning
        : props.tone === "cool"
          ? T.cool
          : T.text;
  return (
    <span
      style={{
        display: props.children ? "inline-block" : "none",
        padding: "1px 8px",
        borderRadius: "999px",
        background: T.bg2,
        color,
        opacity: props.tone ? 1 : 0.75,
        fontSize: "0.75em",
        lineHeight: 1.6,
        whiteSpace: "nowrap",
      }}
    >
      {props.children}
    </span>
  );
}

/**
 * A section that folds: a heading button (▸ closed, ▾ open, and aria-expanded)
 * with an optional summary, over its body. Folding keeps a long stage short;
 * the body stays mounted and is hidden with `display`.
 */
export function Fold(props: {
  title: string;
  summary?: string;
  tone?: "good" | "warn" | "cool" | "dim";
  open: boolean;
  onToggle: () => void;
  children: preact.ComponentChildren;
}) {
  return (
    <section
      style={{
        borderTop: `1px solid ${T.bg3}`,
        paddingBottom: props.open ? SP.lg : 0,
      }}
    >
      <button
        aria-expanded={props.open}
        onClick={props.onToggle}
        style={{
          width: "100%",
          minHeight: TOUCH,
          padding: 0,
          display: "flex",
          alignItems: "center",
          gap: SP.md,
          background: "none",
          border: "none",
          color: T.text,
          font: "inherit",
          textAlign: "left",
          cursor: "pointer",
        }}
      >
        <span
          aria-hidden="true"
          style={{ width: "1em", textAlign: "center", opacity: 0.6 }}
        >
          {props.open ? "▾" : "▸"}
        </span>
        <span
          style={{
            fontFamily: T.fontHeadings,
            fontWeight: "bold",
            color: T.textHeadings,
          }}
        >
          {props.title}
        </span>
        <span style={{ flex: 1 }} />
        <Pill tone={props.tone}>{props.summary ?? ""}</Pill>
      </button>
      <div style={{ display: props.open ? "block" : "none" }}>
        {props.children}
      </div>
    </section>
  );
}

/**
 * The top of a stage: which step it is, what it is for, and how to work it,
 * so the stage needs no other explanation.
 */
export function Intro(props: {
  step: number;
  title: string;
  children: preact.ComponentChildren;
  steps?: readonly string[];
}) {
  const steps = props.steps ?? [];
  return (
    <header
      style={{
        display: "flex",
        flexDirection: "column",
        gap: SP.sm,
        marginBottom: SP.lg,
        lineHeight: 1.5,
      }}
    >
      <span
        style={{
          fontSize: "0.72em",
          fontWeight: "bold",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: T.textDisabled,
        }}
      >
        {`Step ${props.step} of 7`}
      </span>
      <h2
        style={{
          margin: 0,
          fontFamily: T.fontHeadings,
          fontSize: "1.1em",
          color: T.textHeadings,
        }}
      >
        {props.title}
      </h2>
      <p style={{ margin: 0, fontSize: "0.9em" }}>{props.children}</p>
      <ol
        style={{
          display: steps.length ? "flex" : "none",
          flexDirection: "column",
          gap: SP.sm,
          margin: `${SP.sm} 0 0`,
          padding: "8px 10px 8px 28px",
          borderRadius: "8px",
          background: T.bg1,
          fontSize: "0.85em",
        }}
      >
        {steps.map((step, i) => (
          <li key={i}>{step}</li>
        ))}
      </ol>
    </header>
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
    scrollbarWidth: SCROLL.scrollbarWidth,
    scrollbarColor: SCROLL.scrollbarColor,
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
