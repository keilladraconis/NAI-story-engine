// The seven stages as one sequence, left to right with a chevron between
// each, so it reads that each feeds the next. A done stage carries a check; the
// first stage not yet done is marked "next". The strip wraps rather than
// truncating a name, and any stage opens at any time.

import { store, stageOpened } from "../../core/store";
import { STAGES, stageDone } from "../../core/stages";
import { useSlice } from "../bridge";
import { DENSE, SP, T } from "../style";

/** One primitive covering every tab's done state, so the strip re-renders once. */
const doneSignature = (s: Parameters<typeof stageDone>[0]) =>
  STAGES.map((st) => (stageDone(s, st.id) ? "1" : "0")).join("");

export function StageTabs() {
  const current = useSlice((s) => s.ui.stage);
  const done = useSlice(doneSignature);
  const next = done.indexOf("0");

  return (
    <nav aria-label="Stages">
      <ol
        style={{
          listStyle: "none",
          margin: 0,
          padding: `0 8px ${SP.sm}`,
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          rowGap: SP.xs,
          borderBottom: `1px solid ${T.bg3}`,
        }}
      >
        {STAGES.map((stage, i) => {
          const active = stage.id === current;
          const isDone = done[i] === "1";
          return (
            <li
              key={stage.id}
              style={{ display: "flex", alignItems: "center" }}
            >
              <span
                aria-hidden="true"
                style={{
                  display: i ? "inline" : "none",
                  padding: "0",
                  color: T.textDisabled,
                  fontSize: "0.85em",
                }}
              >
                ›
              </span>
              <button
                aria-current={active ? "step" : undefined}
                title={`Step ${i + 1} of ${STAGES.length}`}
                onClick={() => store.dispatch(stageOpened({ stage: stage.id }))}
                style={{
                  minHeight: DENSE,
                  padding: "0 5px",
                  borderRadius: "999px",
                  border: `1px solid ${active ? T.textHeadings : i === next ? T.bg3 : "transparent"}`,
                  background: active ? T.bg2 : "none",
                  color: active
                    ? T.textHeadings
                    : isDone || i === next
                      ? T.text
                      : T.textDisabled,
                  fontWeight: active ? "bold" : "normal",
                  fontSize: "0.8em",
                  whiteSpace: "nowrap",
                  cursor: "pointer",
                }}
              >
                {isDone ? `✓ ${stage.label}` : stage.label}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
