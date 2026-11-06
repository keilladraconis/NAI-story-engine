// Distill: the canon compiled into what the story model reads, then the opening.
// States are read from Memory, the Author's Note and the lorebook, so they are
// refreshed whenever the stage opens, the canon changes, or a distill lands.

import type { RootState } from "../../../core/store";
import {
  distillTargets,
  statuses,
  distill,
  distillAll,
  type DistillStatus,
} from "../../../core/distill";
import { draftOnPage } from "../../../core/workshop/workshop";
import { store } from "../../../core/store";
import { hashText } from "../../../core/text";
import { useSlice } from "../../bridge";
import { SP } from "../../style";
import {
  Button,
  Hint,
  Row,
  SectionTitle,
  StageBody,
  Status,
} from "../../components/kit";
import { ConfirmButton } from "../../components/ConfirmButton";
import { RefreshCw } from "nai:icons/feather";

/** Changes whenever a target's sources or record change. */
const signature = (s: RootState): string =>
  distillTargets(s)
    .map(
      (t) =>
        `${t.id}:${hashText(t.sources)}:${s.distill.records[t.id]?.writtenHash ?? ""}`,
    )
    .join("|");

const labels = (s: RootState): string =>
  distillTargets(s)
    .map((t) => `${t.id}\t${t.label}`)
    .join("\n");

const TONE: Record<DistillStatus, "good" | "warn" | "cool" | "dim"> = {
  current: "good",
  stale: "warn",
  "hand-edited": "cool",
  "not compiled": "dim",
};

const WORD: Record<DistillStatus, string> = {
  current: "✓ current",
  stale: "stale",
  "hand-edited": "✎ hand-edited",
  "not compiled": "not compiled",
};

function TargetRow(props: {
  id: string;
  label: string;
  status: DistillStatus | undefined;
}) {
  const { id, label, status } = props;
  return (
    <div
      style={{
        minHeight: "40px",
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: SP.md,
        padding: "0 4px",
      }}
    >
      <span style={{ flex: "1 1 120px", minWidth: 0 }}>{label}</span>
      <Status tone={status ? TONE[status] : "dim"}>
        {status ? WORD[status] : "…"}
      </Status>
      <div style={{ display: status === "hand-edited" ? "block" : "none" }}>
        <ConfirmButton
          icon={RefreshCw}
          title={`Replace your edit of ${label} with a fresh distill`}
          label="Replace"
          onConfirm={() => void distill(id, true)}
        />
      </div>
      <div style={{ display: status === "hand-edited" ? "none" : "block" }}>
        <Button dense onClick={() => void distill(id)}>
          {status === "current" ? "Again" : "Distill"}
        </Button>
      </div>
    </div>
  );
}

const REFRESH_MS = 4000;

export function DistillStage() {
  const sig = useSlice(signature);
  const list = useSlice(labels);
  const active = useSlice((s) => s.ui.stage === "distill");
  const openingKept = useSlice((s) => s.distill.openingKept);
  const [now, setNow] = useState<Record<string, DistillStatus>>({});

  // Re-read on every canon or record change, and every few seconds while the
  // stage is open: a hand edit in the lorebook, Memory or the Author's Note
  // happens outside the store, so nothing else would notice it.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    let live = true;
    let timer: number | null = null;
    void statuses(store.getState()).then((s) => {
      if (!live) return;
      setNow(s);
      void api.v1.timers
        .setTimeout(() => live && setTick((n) => n + 1), REFRESH_MS)
        .then((id: number) => {
          if (live) timer = id;
          else void api.v1.timers.clearTimeout(id);
        });
    });
    return () => {
      live = false;
      if (timer !== null) void api.v1.timers.clearTimeout(timer);
    };
  }, [sig, active, tick]);

  const todo = Object.values(now).filter(
    (s) => s === "stale" || s === "not compiled",
  ).length;
  const rows = list ? list.split("\n").map((l) => l.split("\t")) : [];

  return (
    <StageBody>
      <Hint>
        The canon compiled into what the story model reads: Memory, the Author's
        Note and the lorebook. Nothing is invented here. Edit an entry by hand
        and Story Engine leaves it alone; a change of substance belongs in the
        canon.
      </Hint>
      <Row>
        <span style={{ flex: 1, fontSize: "0.85em", opacity: 0.8 }}>
          {rows.length
            ? `${todo} to compile`
            : "Nothing to compile yet: write the canon first."}
        </span>
        <Button
          dense
          tone="primary"
          disabled={!todo}
          onClick={() => void distillAll()}
        >
          {`Distill ${todo || ""}`.trim()}
        </Button>
      </Row>
      <SectionTitle>Story fields and lorebook</SectionTitle>
      {rows.map(([id, label]) => (
        <TargetRow key={id} id={id} label={label} status={now[id]} />
      ))}
      <SectionTitle>Opening</SectionTitle>
      <Hint>
        Drafted on the page with NovelAI's own context, so it is the first real
        test of what was distilled. Keeping it turns Workshop Sends off.
      </Hint>
      <Row>
        <Button
          tone={openingKept ? "plain" : "primary"}
          onClick={() => void draftOnPage({ kind: "opening" })}
        >
          {openingKept ? "✓ Opening kept · draft another" : "Draft the opening"}
        </Button>
      </Row>
    </StageBody>
  );
}
