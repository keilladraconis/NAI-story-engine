// Foundation-import rows of the JSX Import wizard: Memory→ATTG, A/N→Style (each a
// one-click import that marks itself done), and Story→Shape+Intent generation.

import { T, SP } from "../../style";
import {
  store,
  attgUpdated,
  attgSyncSet,
  styleUpdated,
  styleSyncSet,
  shapeGenerationRequested,
  intentGenerationRequested,
  contractGenerationRequested,
} from "../../../core/store";
import { useTapGuard } from "../../tap-guard";

const truncate = (s: string, n: number) =>
  s.length > n ? s.slice(0, n) + "…" : s;

const row = {
  display: "flex",
  alignItems: "center",
  gap: SP.sm,
  padding: "6px 0",
  borderBottom: "1px solid rgba(255,255,255,0.04)",
} as const;
const label = {
  flexShrink: 0,
  fontSize: "0.8em",
  fontWeight: "bold",
  opacity: 0.8,
  // No fixed min-width: it can't shrink (flexShrink:0), so a floor wider than the
  // label's text inflates the row's intrinsic width past the overflow:auto pane
  // and clips the trailing button. Content-width labels keep the row within the pane.
} as const;
const preview = {
  flex: 1,
  minWidth: 0, // let the flex item shrink below content width so the button stays on-screen
  fontSize: "0.75em",
  opacity: 0.5,
  overflow: "hidden",
  whiteSpace: "nowrap",
  textOverflow: "ellipsis",
} as const;
const btn = {
  flexShrink: 0,
  fontSize: "0.75em",
  padding: "2px 8px",
  background: T.bg2,
  color: T.text,
  border: "none",
  cursor: "pointer",
} as const;

export function ImportFoundation(props: { memText: string; anText: string }) {
  const [attgDone, setAttgDone] = useState(false);
  const [styleDone, setStyleDone] = useState(false);
  // `disabled` is not a guard here: the repeat click of a doubled tap arrives
  // before the re-render that would disable the button.
  const onceAttgTap = useTapGuard();
  const onceStyleTap = useTapGuard();
  const onceShapeTap = useTapGuard();
  const onceIntentTap = useTapGuard();
  const onceContractTap = useTapGuard();

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {props.memText.trim() ? (
        <div style={{ ...row, opacity: attgDone ? 0.4 : 1 }}>
          <span style={label}>Memory → ATTG</span>
          <span style={preview}>{truncate(props.memText, 60)}</span>
          <button
            style={btn}
            disabled={attgDone}
            onClick={() =>
              onceAttgTap(() => {
                store.dispatch(attgUpdated({ attg: props.memText }));
                store.dispatch(attgSyncSet({ enabled: true }));
                void api.v1.memory.set(props.memText);
                setAttgDone(true);
              })
            }
          >
            {attgDone ? "Imported ✓" : "Import"}
          </button>
        </div>
      ) : null}

      {props.anText.trim() ? (
        <div style={{ ...row, opacity: styleDone ? 0.4 : 1 }}>
          <span style={label}>A/N → Style</span>
          <span style={preview}>{truncate(props.anText, 60)}</span>
          <button
            style={btn}
            disabled={styleDone}
            onClick={() =>
              onceStyleTap(() => {
                store.dispatch(styleUpdated({ style: props.anText }));
                store.dispatch(styleSyncSet({ enabled: true }));
                setStyleDone(true);
              })
            }
          >
            {styleDone ? "Imported ✓" : "Import"}
          </button>
        </div>
      ) : null}

      <div style={row}>
        <span style={label}>Story → Shape + Intent + Contract</span>
        <span style={preview} />
        <button
          style={btn}
          onClick={() =>
            onceShapeTap(() => store.dispatch(shapeGenerationRequested()))
          }
        >
          Shape
        </button>
        <button
          style={btn}
          onClick={() =>
            onceIntentTap(() => store.dispatch(intentGenerationRequested()))
          }
        >
          Intent
        </button>
        {/* Contract reads Shape/Intent as anchors, and factories resolve when the
            queued task runs — so pressing this after the other two picks them up. */}
        <button
          style={btn}
          onClick={() =>
            onceContractTap(() => store.dispatch(contractGenerationRequested()))
          }
        >
          Contract
        </button>
      </div>
    </div>
  );
}
