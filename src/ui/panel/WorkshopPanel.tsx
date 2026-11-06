// The script panel under the page. Two rows at most, because at phone width a
// script panel grows with its content and squeezes the page:
//   1. the Workshop Sends switch;
//   2. what is being drafted, the direction, and the save button.
// Sending is NovelAI's own Send; Retry rejects a draft.

import { store, type RootState, type Target } from "../../core/store";
import {
  setWorkshopOn,
  chooseTarget,
  saveDraft,
  setDirection,
  stopWriting,
} from "../../core/workshop/workshop";
import {
  KIND_ORDER,
  defaultDirection,
  saveLabel,
  targetLabel,
} from "../../core/workshop/targets";
import { useSlice } from "../bridge";
import { SP, T, TOUCH } from "../style";

export function encodeTarget(target: Target): string {
  return target.kind === "doc" ? `doc:${target.docId}` : target.kind;
}

export function decodeTarget(value: string): Target {
  if (value.startsWith("doc:")) return { kind: "doc", docId: value.slice(4) };
  return { kind: value as "vignette" | "startingPoint" | "opening" };
}

/** Picker options as `value\tlabel` lines: a primitive, so useSlice can compare it. */
function optionsSignature(state: RootState): string {
  const docs = [...state.canon.docs].sort(
    (a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind),
  );
  const targets: Target[] = [
    { kind: "vignette" },
    { kind: "startingPoint" },
    ...docs.map((d) => ({ kind: "doc" as const, docId: d.id })),
    { kind: "opening" },
  ];
  return targets
    .map((t) => `${encodeTarget(t)}\t${targetLabel(state, t)}`)
    .join("\n");
}

const control = {
  minHeight: TOUCH,
  boxSizing: "border-box",
  borderRadius: "6px",
  font: "inherit",
} as const;

export function WorkshopPanel() {
  const on = useSlice((s) => s.workshop.on);
  const target = useSlice((s) => encodeTarget(s.workshop.target));
  const options = useSlice(optionsSignature);
  const save = useSlice((s) => saveLabel(s, s.workshop.target));
  const placeholder = useSlice((s) => defaultDirection(s, s.workshop.target));
  const writing = useSlice((s) => s.runtime.autoDraft);
  const [text, setText] = useState("");
  // Bumped when a target change is refused: the select already shows the new
  // value, and an unchanged store value would not repaint it, so remount it.
  const [selectKey, setSelectKey] = useState(0);

  // A new target starts with an empty direction (the core forgets it too).
  useEffect(() => setText(""), [target]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: SP.md,
        padding: SP.md,
        color: T.text,
        fontFamily: T.fontDefault,
      }}
    >
      <button
        role="switch"
        aria-checked={on}
        onClick={() => void setWorkshopOn(!on)}
        style={{
          ...control,
          alignSelf: "flex-start",
          display: "inline-flex",
          alignItems: "center",
          gap: SP.md,
          padding: "0 12px",
          background: on ? T.textHeadings : "transparent",
          color: on ? T.bg : T.text,
          border: `1px solid ${on ? T.textHeadings : T.bg3}`,
          fontWeight: on ? "bold" : "normal",
          cursor: "pointer",
        }}
      >
        {on ? "Workshop Sends: on" : "Workshop Sends: off"}
      </button>

      <div
        style={{
          display: on ? "flex" : "none",
          flexWrap: "wrap",
          gap: SP.md,
        }}
      >
        <select
          key={selectKey}
          aria-label="Drafting"
          value={target}
          onChange={(e) => {
            const picked = decodeTarget(e.currentTarget.value ?? target);
            void chooseTarget(picked).then((ok) => {
              if (!ok) setSelectKey((k) => k + 1);
            });
          }}
          style={{
            ...control,
            flex: "1 1 120px",
            padding: "0 8px",
            background: T.bg2,
            color: T.text,
            border: `1px solid ${T.bg3}`,
          }}
        >
          {options.split("\n").map((line) => {
            const [value, label] = line.split("\t");
            return (
              <option key={value} value={value}>
                {label}
              </option>
            );
          })}
        </select>
        <input
          aria-label="Direction"
          type="text"
          value={text}
          placeholder={placeholder}
          onInput={(e) => {
            const value = e.currentTarget.value ?? "";
            setText(value);
            setDirection(value);
          }}
          style={{
            ...control,
            flex: "999 1 220px",
            minWidth: 0,
            padding: "0 10px",
            background: T.bg,
            color: T.text,
            border: `1px solid ${T.bg3}`,
          }}
        />
        <button
          onClick={stopWriting}
          style={{
            ...control,
            display: writing ? "block" : "none",
            flex: "1 1 140px",
            padding: "0 12px",
            background: T.bg2,
            color: T.text,
            border: `1px solid ${T.bg3}`,
            cursor: "pointer",
          }}
        >
          Stop writing
        </button>
        <button
          onClick={() => void saveDraft()}
          style={{
            ...control,
            display: writing ? "none" : "block",
            flex: "1 1 140px",
            padding: "0 12px",
            background: T.textHeadings,
            color: T.bg,
            border: "none",
            fontWeight: "bold",
            cursor: "pointer",
          }}
        >
          {save}
        </button>
      </div>
    </div>
  );
}

/** For the divider widget, which is built outside the Preact tree. */
export function currentSaveLabel(): string {
  const state = store.getState();
  return saveLabel(state, state.workshop.target);
}
