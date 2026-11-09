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
import { BuildCanon } from "../BuildCanon";

const summary = (s: RootState): string => {
  const withText = s.canon.docs.filter((d) => d.text.trim());
  const reviewed = withText.filter(reviewCurrent).length;
  const issues = openIssueCount(s);
  return `${reviewed} of ${withText.length} reviewed · ${issues} ${issues === 1 ? "issue" : "issues"}`;
};

/** Every document's id, in the order the stage lists them. */
const ids = (s: RootState): string =>
  [...s.canon.docs]
    .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind))
    .map((d) => d.id)
    .join(",");

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

export function CanonStage() {
  const line = useSlice(summary);
  const missing = useSlice((s) =>
    missingKinds(s)
      .map((k) => KINDS[k].heading)
      .join(", "),
  );
  const list = useSlice(ids);
  const issueCount = useSlice(openIssueCount);
  const docOpen = useSlice((s) =>
    s.canon.docs.some((d) => d.id === s.ui.openDocId),
  );
  const building = useSlice(
    (s) => s.runtime.build.running || s.runtime.plan.length > 0,
  );
  // null: follow the canon (open while there is something to build).
  const [buildFold, setBuildFold] = useState<boolean | null>(null);
  const [docsFold, setDocsFold] = useState(true);
  const buildOpen = buildFold ?? (Boolean(missing) || building);
  // An opened document (from the lorebook, or a new one) unfolds the list.
  const docsOpen = docsFold || docOpen;

  return (
    <StageBody>
      <Hint>
        The world in full prose: the source of truth. Plan and Build drafts each
        document on the page; the critic then checks them against the brief, the
        starting point and each other. Work through the issues under each
        document, and edit anything by hand.
      </Hint>
      <Fold
        title="Build"
        summary={missing ? `${missing.split(", ").length} kinds needed` : "✓"}
        tone={missing ? "warn" : "good"}
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
        title="Documents"
        summary={issueCount ? `${issueCount} to fix` : list ? "✓" : "none yet"}
        tone={issueCount ? "warn" : list ? "good" : undefined}
        open={docsOpen}
        onToggle={() => {
          if (docsOpen && docOpen) store.dispatch(docOpened({ id: null }));
          setDocsFold(!docsOpen);
        }}
      >
        <Row>
          <span style={{ flex: 1, fontSize: "0.85em", opacity: 0.75 }}>
            {line}
          </span>
          <Button dense onClick={() => void reviewAll()}>
            Review all
          </Button>
        </Row>
        <div style={{ height: SP.md }} />
        {(list ? list.split(",") : []).map((id) => (
          <DocCard key={id} id={id} />
        ))}
        <SectionTitle>Add a document</SectionTitle>
        <AddDoc />
      </Fold>
    </StageBody>
  );
}
