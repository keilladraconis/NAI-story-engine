// Canon: free-prose documents, the source of truth everything is distilled
// from. Drafted on the page, checked by the critic.

import type { DocKind, RootState } from "../../../core/store";
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
  Hint,
  Row,
  SectionTitle,
  StageBody,
} from "../../components/kit";
import { DocCard } from "../DocCard";

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

export function CanonStage() {
  const line = useSlice(summary);
  const missing = useSlice((s) =>
    missingKinds(s)
      .map((k) => KINDS[k].heading)
      .join(", "),
  );
  const list = useSlice(groups);

  return (
    <StageBody>
      <Hint>
        The world in full prose: the source of truth. Draft each document on the
        page; the critic checks it against the brief, the starting point and the
        rest.
      </Hint>
      <Row>
        <span style={{ flex: 1, fontSize: "0.85em", opacity: 0.8 }}>
          {line}
        </span>
        <Button dense onClick={() => void reviewAll()}>
          Review all
        </Button>
      </Row>
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
      {(list ? list.split("\n") : []).map((group) => {
        const [kind, ids] = group.split("\t");
        return (
          <section key={kind}>
            <SectionTitle>{KINDS[kind as DocKind].heading}</SectionTitle>
            {ids.split(",").map((id) => (
              <DocCard key={id} id={id} />
            ))}
          </section>
        );
      })}
      <SectionTitle>Add a document</SectionTitle>
      <AddDoc />
    </StageBody>
  );
}
