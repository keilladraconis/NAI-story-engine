// The six stages, left to right, each with a check once done. The order is the
// advised workflow; any tab opens at any time.

import { store, stageOpened } from "../../core/store";
import { STAGES, stageDone } from "../../core/stages";
import { useSlice } from "../bridge";
import { T, TOUCH } from "../style";

/** One primitive covering every tab's done state, so the strip re-renders once. */
const doneSignature = (s: Parameters<typeof stageDone>[0]) =>
  STAGES.map((st) => (stageDone(s, st.id) ? "1" : "0")).join("");

export function StageTabs() {
  const current = useSlice((s) => s.ui.stage);
  const done = useSlice(doneSignature);

  return (
    <nav aria-label="Stages">
      <ol
        style={{
          listStyle: "none",
          margin: 0,
          padding: "0 8px",
          display: "grid",
          gridTemplateColumns: `repeat(${STAGES.length}, minmax(0, 1fr))`,
          gap: "2px",
          borderBottom: `1px solid ${T.bg3}`,
        }}
      >
        {STAGES.map((stage, i) => {
          const active = stage.id === current;
          const isDone = done[i] === "1";
          return (
            <li key={stage.id}>
              <button
                aria-current={active ? "step" : undefined}
                onClick={() => store.dispatch(stageOpened({ stage: stage.id }))}
                style={{
                  width: "100%",
                  minHeight: TOUCH,
                  padding: "0 2px",
                  background: "none",
                  border: "none",
                  borderBottom: `2px solid ${active ? T.textHeadings : "transparent"}`,
                  color: active
                    ? T.textHeadings
                    : isDone
                      ? T.text
                      : T.textDisabled,
                  fontWeight: active ? "bold" : "normal",
                  fontSize: "0.78em",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
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
