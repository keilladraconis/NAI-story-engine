// The Story Engine tab in the lorebook's Script tab: for an entry Story Engine
// compiled, where it came from, its state, and the canon-first ways to change it.

import {
  store,
  stageOpened,
  docOpened,
  type RootState,
} from "../../core/store";
import {
  distillTargets,
  readCurrent,
  statusOf,
  distill,
  type DistillStatus,
} from "../../core/distill";
import { rewriteWith } from "../../core/critic";
import { hashText } from "../../core/text";
import { useSlice } from "../bridge";
import { DENSE, SP, T } from "../style";
import { Button, Row, Status } from "../components/kit";
import { ConfirmButton } from "../components/ConfirmButton";
import { RefreshCw } from "nai:icons/feather";

/** The distill target that wrote the selected entry, as `id\tlabel`, or "". */
const selectedTarget = (s: RootState): string => {
  const entryId = s.ui.lorebookEntryId;
  if (!entryId) return "";
  const id = Object.keys(s.distill.records).find(
    (k) => s.distill.records[k].entryId === entryId,
  );
  if (!id) return "";
  const target = distillTargets(s).find((t) => t.id === id);
  return target ? `${id}\t${target.label}` : "";
};

function Sources(props: { targetId: string }) {
  const docs = useSlice((s) => {
    const target = distillTargets(s).find((t) => t.id === props.targetId);
    return (target?.docIds ?? [])
      .map((id) => {
        const doc = s.canon.docs.find((d) => d.id === id);
        return doc ? `${doc.id}\t${doc.title}` : "";
      })
      .filter(Boolean)
      .join("\n");
  });
  const list = docs ? docs.split("\n").map((l) => l.split("\t")) : [];
  return (
    <Row gap={SP.sm}>
      <span style={{ fontSize: "0.85em", opacity: 0.75 }}>Compiled from:</span>
      {list.map(([id, title]) => (
        <Button
          key={id}
          dense
          tone="quiet"
          title="Open it in the Story Engine sidebar's Canon stage"
          onClick={() => {
            store.dispatch(stageOpened({ stage: "canon" }));
            store.dispatch(docOpened({ id }));
            void api.v1.ui.toast(`${title} is open in Story Engine › Canon.`, {
              type: "info",
            });
          }}
        >
          {title}
        </Button>
      ))}
      <span
        style={{ display: list.length ? "none" : "inline", fontSize: "0.85em" }}
      >
        the brief and starting point
      </span>
    </Row>
  );
}

export function LorebookPanel() {
  const selected = useSlice(selectedTarget);
  const [targetId, label] = selected ? selected.split("\t") : ["", ""];
  const sig = useSlice((s) => {
    const t = distillTargets(s).find((x) => x.id === targetId);
    return t
      ? `${hashText(t.sources)}:${s.distill.records[targetId]?.writtenHash ?? ""}`
      : "";
  });
  const single = useSlice((s) => {
    const t = distillTargets(s).find((x) => x.id === targetId);
    if (!t) return "";
    // A profile's substance is its dossier, even though relationships feed it too.
    if (t.id.startsWith("entry:profile:") || t.docIds.length === 1)
      return t.docIds[0];
    return "";
  });
  const [status, setStatus] = useState<DistillStatus | null>(null);
  const [text, setText] = useState("");

  useEffect(() => {
    let live = true;
    setStatus(null);
    const state = store.getState();
    const target = distillTargets(state).find((t) => t.id === targetId);
    if (!target) return;
    const record = state.distill.records[targetId];
    void readCurrent(target, record).then((current) => {
      if (live) setStatus(statusOf(target, record, current));
    });
    return () => {
      live = false;
    };
  }, [targetId, sig]);

  const change = () => {
    const ask = text.trim();
    if (!ask || !single) return;
    setText("");
    void rewriteWith(single, ask).then(() => distill(targetId));
  };

  return (
    <div
      style={{
        padding: SP.md,
        color: T.text,
        fontFamily: T.fontDefault,
        display: "flex",
        flexDirection: "column",
        gap: SP.md,
      }}
    >
      <p
        style={{
          display: targetId ? "none" : "block",
          margin: 0,
          opacity: 0.75,
        }}
      >
        Story Engine did not write this entry.
      </p>
      <div
        style={{
          display: targetId ? "flex" : "none",
          flexDirection: "column",
          gap: SP.md,
        }}
      >
        <Row>
          <strong style={{ flex: 1 }}>{label}</strong>
          <Status
            tone={
              status === "current"
                ? "good"
                : status === "hand-edited"
                  ? "cool"
                  : status === "stale"
                    ? "warn"
                    : "dim"
            }
          >
            {status ?? "…"}
          </Status>
        </Row>
        <Sources targetId={targetId} />
        <p
          style={{
            display: status === "hand-edited" ? "block" : "none",
            margin: 0,
            fontSize: "0.85em",
            lineHeight: 1.5,
          }}
        >
          Edited by hand since it was compiled. Story Engine keeps your edit; a
          re-distill replaces it only if you confirm.
        </p>
        <Row>
          <div style={{ display: status === "hand-edited" ? "block" : "none" }}>
            <ConfirmButton
              icon={RefreshCw}
              title="Replace your edit with a fresh distill"
              label="Re-distill"
              onConfirm={() => void distill(targetId, true)}
            />
          </div>
          <div style={{ display: status === "hand-edited" ? "none" : "block" }}>
            <Button dense onClick={() => void distill(targetId)}>
              Re-distill
            </Button>
          </div>
        </Row>
        <div
          style={{
            display: single ? "flex" : "none",
            flexDirection: "column",
            gap: SP.sm,
          }}
        >
          <span style={{ fontSize: "0.85em", opacity: 0.75 }}>
            Change something that matters: the canon is rewritten first, then
            this entry is distilled from it.
          </span>
          <Row>
            <input
              type="text"
              aria-label="What to change"
              value={text}
              placeholder="e.g. Tam left the mainland owing money"
              onInput={(e) => setText(e.currentTarget.value ?? "")}
              style={{
                flex: "999 1 180px",
                minWidth: 0,
                minHeight: DENSE,
                boxSizing: "border-box",
                padding: "0 8px",
                borderRadius: "6px",
                border: `1px solid ${T.bg3}`,
                background: T.bg,
                color: T.text,
                font: "inherit",
              }}
            />
            <Button dense onClick={change}>
              Rewrite the canon
            </Button>
          </Row>
        </div>
      </div>
    </div>
  );
}
