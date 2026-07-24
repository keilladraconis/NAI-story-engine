// Intensity: a wrapping row of level buttons + the selected level's description.
// No edit pane and no generation — clicking a level dispatches intensityUpdated.
// Selected level uses the NAI header highlight (T.textHeadings) on a subtle
// T.bg3 chip; others are dimmed. Replaces SUI's green literal.

import { useSlice } from "../../bridge";
import { T, SP } from "../../style";
import { store, intensityUpdated } from "../../../core/store";
import { INTENSITY_LEVELS } from "./fields";

export function IntensityPicker() {
  const intensity = useSlice((s) => s.foundation.intensity);
  const current = intensity?.level ?? "";

  return (
    <div
      style={{
        background: T.bg2,
        color: T.text,
        fontFamily: T.fontDefault,
        padding: SP.md,
        display: "flex",
        flexDirection: "column",
        gap: SP.sm,
      }}
    >
      <span style={{ color: T.textHeadings }}>{current || "Intensity"}</span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: SP.sm }}>
        {INTENSITY_LEVELS.map((il) => {
          const selected = il.level === current;
          return (
            <button
              key={il.level}
              onClick={() =>
                store.dispatch(
                  intensityUpdated({
                    intensity: { level: il.level, description: il.description },
                  }),
                )
              }
              style={{
                border: "none",
                cursor: "pointer",
                padding: "3px 8px",
                fontSize: "0.775rem",
                borderRadius: "3px",
                background: selected ? T.bg3 : "transparent",
                color: selected ? T.textHeadings : T.textDisabled,
                opacity: selected ? 1 : 0.6,
              }}
            >
              {il.level}
            </button>
          );
        })}
      </div>
      <div
        style={{
          fontSize: "0.85em",
          whiteSpace: "pre-wrap",
          color: intensity ? T.text : T.textDisabled,
        }}
      >
        {intensity?.description || "No intensity defined"}
      </div>
    </div>
  );
}
