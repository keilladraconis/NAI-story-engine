// Canon: free-prose documents, the source of truth everything is distilled
// from. Drafted on the page, checked by the critic.

import {
  store,
  docOpened,
  type DocKind,
  type RootState,
} from "../../../core/store";
import {
  missingKinds,
  openIssueCount,
  reviewCurrent,
} from "../../../core/stages";
import { reviewAll } from "../../../core/critic";
import { addDoc } from "../../../core/canon";
import { KINDS, KIND_ORDER } from "../../../core/workshop/targets";
import { useSlice } from "../../bridge";
import { DENSE, SP, T } from "../../style";
import {
  Button,
  Fold,
  Hint,
  Row,
  SectionTitle,
  StageBody,
} from "../../components/kit";
import { DocCard } from "../DocCard";
import { IssueList } from "../IssueList";
import { BuildCanon } from "../BuildCanon";

const summary = (s: RootState): string => {
  const withText = s.canon.docs.filter((d) => d.text.trim());
  const reviewed = withText.filter(reviewCurrent).length;
  const issues = openIssueCount(s);
  return `${reviewed} of ${withText.length} reviewed · ${issues} ${issues === 1 ? "issue" : "issues"}`;
};

/** `kind\tid,id` lines, in the order the stage lists them. */
const groups = (s: RootState): string =>
  KIND_ORDER.map((kind) => {
    const ids = s.canon.docs.filter((d) => d.kind === kind).map((d) => d.id);
    return ids.length ? `${kind}\t${ids.join(",")}` : "";
  })
    .filter(Boolean)
    .join("\n");

export function AddDoc(props: { kinds?: readonly DocKind[] }) {
  const kinds = props.kinds ?? KIND_ORDER;
  const [kind, setKind] = useState<DocKind>(kinds[0]);
  const [name, setName] = useState("");
  const named = kind === "dossier" || kind === "system";
  const control = {
    minHeight: DENSE,
    boxSizing: "border-box",
    borderRadius: "6px",
    border: `1px solid ${T.bg3}`,
    background: T.bg,
    color: T.text,
    font: "inherit",
    padding: "0 8px",
  } as const;
  return (
    <Row>
      <select
        aria-label="Kind of document"
        value={kind}
        onChange={(e) =>
          setKind((e.currentTarget.value ?? kinds[0]) as DocKind)
        }
        style={{
          ...control,
          flex: "1 1 120px",
          display: kinds.length > 1 ? "block" : "none",
        }}
      >
        {kinds.map((k) => (
          <option key={k} value={k}>
            {KINDS[k].heading}
          </option>
        ))}
      </select>
      <input
        type="text"
        aria-label={kind === "dossier" ? "Name" : "Title"}
        value={name}
        placeholder={kind === "dossier" ? "Name" : "Title"}
        onInput={(e) => setName(e.currentTarget.value ?? "")}
        style={{
          ...control,
          flex: "999 1 140px",
          minWidth: 0,
          display: named ? "block" : "none",
        }}
      />
      <Button
        dense
        onClick={() => {
          addDoc(kind, name);
          setName("");
        }}
      >
        {kind === "dossier" ? "+ Dossier" : "+ Add"}
      </Button>
    </Row>
  );
}

/** One kind's documents, folded to a summary line until opened. */
function KindGroup(props: { kind: DocKind; ids: string }) {
  const { kind } = props;
  const holdsOpen = useSlice((s) => {
    const open = s.canon.docs.find((d) => d.id === s.ui.openDocId);
    return open?.kind === kind;
  });
  const summary = useSlice((s) => {
    const docs = s.canon.docs.filter((d) => d.kind === kind);
    const issues = docs.reduce(
      (n, d) => n + (reviewCurrent(d) ? (d.review?.issues.length ?? 0) : 0),
      0,
    );
    const empty = docs.filter((d) => !d.text.trim()).length;
    if (empty) return `${empty} empty`;
    if (issues) return `${issues} ${issues === 1 ? "issue" : "issues"}`;
    return docs.every(reviewCurrent) ? "✓" : "not reviewed";
  });
  const [toggled, setToggled] = useState(false);
  // Open while toggled open, or while it holds the open document (Open on
  // an issue unfolds it). Folding it closes that document too.
  const open = toggled || holdsOpen;
  return (
    <Fold
      title={KINDS[kind].heading}
      summary={summary}
      open={open}
      onToggle={() => {
        if (open && holdsOpen) store.dispatch(docOpened({ id: null }));
        setToggled(!open);
      }}
    >
      {props.ids.split(",").map((id) => (
        <DocCard key={id} id={id} issues={false} />
      ))}
    </Fold>
  );
}

export function CanonStage() {
  const line = useSlice(summary);
  const missing = useSlice((s) =>
    missingKinds(s)
      .map((k) => KINDS[k].heading)
      .join(", "),
  );
  const list = useSlice(groups);
  const issueCount = useSlice(openIssueCount);
  const building = useSlice(
    (s) => s.runtime.build.running || s.runtime.plan.length > 0,
  );
  // null: follow the canon (open while there is something to do there).
  const [buildFold, setBuildFold] = useState<boolean | null>(null);
  const [issuesFold, setIssuesFold] = useState<boolean | null>(null);
  const [docsFold, setDocsFold] = useState(true);
  const buildOpen = buildFold ?? (Boolean(missing) || building);
  const issuesOpen = issuesFold ?? issueCount > 0;

  return (
    <StageBody>
      <Hint>
        The world in full prose: the source of truth. Plan the canon, pick the
        documents, and Build drafts each on the page and saves it; the critic
        then checks them all against the brief, the starting point and each
        other. Work through the issues, and edit anything by hand.
      </Hint>
      <Fold
        title="Build"
        summary={missing ? `${missing.split(", ").length} kinds needed` : "✓"}
        open={buildOpen}
        onToggle={() => setBuildFold(!buildOpen)}
      >
        <BuildCanon />
        <p
          style={{
            display: missing ? "block" : "none",
            margin: `${SP.md} 0 0`,
            fontSize: "0.85em",
            color: T.warning,
          }}
        >
          Still needed: {missing}.
        </p>
      </Fold>
      <Fold
        title="Issues"
        summary={line}
        open={issuesOpen}
        onToggle={() => setIssuesFold(!issuesOpen)}
      >
        <Row>
          <span style={{ flex: 1, fontSize: "0.85em", opacity: 0.8 }}>
            {issueCount
              ? "Fix, dismiss, or open the document."
              : "No open issues."}
          </span>
          <Button dense onClick={() => void reviewAll()}>
            Review all
          </Button>
        </Row>
        <div style={{ height: SP.sm }} />
        <IssueList />
      </Fold>
      <Fold
        title="Documents"
        summary={list ? `${list.split("\n").length} kinds` : "none yet"}
        open={docsFold}
        onToggle={() => setDocsFold(!docsFold)}
      >
        {(list ? list.split("\n") : []).map((group) => {
          const [kind, ids] = group.split("\t");
          return <KindGroup key={kind} kind={kind as DocKind} ids={ids} />;
        })}
        <SectionTitle>Add a document</SectionTitle>
        <AddDoc />
      </Fold>
    </StageBody>
  );
}
