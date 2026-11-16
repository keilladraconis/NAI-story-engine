// The foot of a stage: the way on to the next one. Lit once this stage is
// done; before that it says what is left, and still lets the writer go on.

import { store, stageOpened, type StageId } from "../../core/store";
import { STAGES, stageDone } from "../../core/stages";
import { useSlice } from "../bridge";
import { SP, T } from "../style";
import { Button } from "../components/kit";

export function NextStage(props: { from: StageId; todo: string }) {
  const at = STAGES.findIndex((s) => s.id === props.from);
  const next = STAGES[at + 1];
  const done = useSlice((s) => stageDone(s, props.from));
  if (!next) return null;
  return (
    <footer
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: SP.md,
        marginTop: SP.lg,
        paddingTop: SP.lg,
        borderTop: `1px solid ${T.bg3}`,
      }}
    >
      <span
        style={{
          flex: "1 1 160px",
          fontSize: "0.85em",
          lineHeight: 1.5,
          color: done ? T.good : T.textDisabled,
        }}
      >
        {done ? `✓ Done. ${next.label} builds on it.` : props.todo}
      </span>
      <Button
        tone={done ? "primary" : "plain"}
        onClick={() => store.dispatch(stageOpened({ stage: next.id }))}
      >
        {`Next: ${next.label} ›`}
      </Button>
    </footer>
  );
}
