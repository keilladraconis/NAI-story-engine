// Build the canon hands-off: GLM plans the documents (pick cards, all picked),
// Build these drafts and saves each in turn, and the critic checks them all at
// the end. The lit button is the next step: Plan while there is no plan,
// Build these once there is one.

import { store, planToggled } from "../../core/store";
import { PLAN_LABEL, buildCanon, planCanon, stopBuild } from "../../core/build";
import { KINDS } from "../../core/workshop/targets";
import { useSlice } from "../bridge";
import { SP, T, TOUCH } from "../style";
import { Choice } from "../components/Choice";
import { Button, Row } from "../components/kit";

export function BuildCanon() {
  const count = useSlice((s) => s.runtime.plan.length);
  const picked = useSlice((s) => s.runtime.plan.filter((i) => i.picked).length);
  const planning = useSlice((s) =>
    s.runtime.jobs.some((j) => j.label === PLAN_LABEL),
  );
  const running = useSlice((s) => s.runtime.build.running);
  const status = useSlice(({ runtime: { build } }) =>
    !build.running
      ? ""
      : build.current
        ? `Drafting ${build.done + 1} of ${build.total}: ${build.current}…`
        : "Drafted. The critic is checking each document…",
  );
  const [note, setNote] = useState("");
  const busy = planning || running;

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: SP.md }}>
      <p
        style={{
          display: planning || status ? "block" : "none",
          margin: 0,
          lineHeight: 1.5,
        }}
      >
        {planning ? "Planning the documents…" : status}
      </p>
      <div
        style={{
          display: count ? "flex" : "none",
          flexWrap: "wrap",
          gap: SP.sm,
        }}
      >
        {Array.from({ length: count }, (_, i) => (
          <PlanChoice key={i} index={i} live={!busy} />
        ))}
      </div>
      <input
        aria-label="Steer the plan"
        type="text"
        value={note}
        placeholder={
          count
            ? "Optional: say what to change, then Plan again"
            : "Optional: steer the plan, then Plan the canon"
        }
        onInput={(e) => setNote(e.currentTarget.value ?? "")}
        style={{
          minHeight: TOUCH,
          boxSizing: "border-box",
          padding: "0 10px",
          borderRadius: "6px",
          border: `1px solid ${T.bg3}`,
          background: T.bg,
          color: T.text,
          font: "inherit",
        }}
      />
      <Row>
        <Button
          tone={picked ? "primary" : "plain"}
          disabled={busy || !picked}
          onClick={() => void buildCanon()}
        >
          {picked ? `Build these ${picked}` : "Build"}
        </Button>
        <Button
          tone={picked ? "plain" : "primary"}
          disabled={busy}
          onClick={() => {
            void planCanon(note);
            setNote("");
          }}
        >
          {count ? "Plan again" : "Plan the canon"}
        </Button>
        <div style={{ display: running ? "block" : "none" }}>
          <Button onClick={stopBuild}>Stop</Button>
        </div>
      </Row>
    </section>
  );
}

function PlanChoice(props: { index: number; live: boolean }) {
  const item = useSlice((s) => s.runtime.plan[props.index]);
  const kind = item ? KINDS[item.kind].noun : "";
  return (
    <Choice
      label={item?.title ?? ""}
      description={
        item?.title.toLowerCase() === kind
          ? (item?.why ?? "")
          : [kind, item?.why].filter(Boolean).join(": ")
      }
      picked={item?.picked ?? false}
      live={props.live}
      onPick={() => store.dispatch(planToggled({ index: props.index }))}
    />
  );
}
