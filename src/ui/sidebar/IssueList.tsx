// Every open critic issue in the canon, as one list: the writer works through
// them without opening each document. Open unfolds the document (and its
// group) in place; NovelAI gives a script no way to scroll to it.

import {
  store,
  docOpened,
  issueDismissed,
  type RootState,
} from "../../core/store";
import { reviewCurrent } from "../../core/stages";
import { fix } from "../../core/critic";
import { KIND_ORDER } from "../../core/workshop/targets";
import { docHeading } from "../../core/workshop/frames";
import { useSlice } from "../bridge";
import { SP, T } from "../style";
import { Button, Row } from "../components/kit";

/** `docId\tissueId` lines for current reviews, in the stage's order. */
export const issueLines = (s: RootState): string =>
  [...s.canon.docs]
    .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind))
    .flatMap((d) =>
      reviewCurrent(d)
        ? (d.review?.issues ?? []).map((i) => `${d.id}\t${i.id}`)
        : [],
    )
    .join("\n");

export function IssueList() {
  const lines = useSlice(issueLines);
  return (
    <ul
      style={{
        listStyle: "none",
        margin: 0,
        padding: 0,
        display: "flex",
        flexDirection: "column",
        gap: SP.sm,
      }}
    >
      {(lines ? lines.split("\n") : []).map((line) => {
        const [docId, issueId] = line.split("\t");
        return <IssueRow key={line} docId={docId} issueId={issueId} />;
      })}
    </ul>
  );
}

function IssueRow(props: { docId: string; issueId: string }) {
  const doc = useSlice((s) => s.canon.docs.find((d) => d.id === props.docId));
  const issue = doc?.review?.issues.find((i) => i.id === props.issueId);
  if (!doc || !issue) return null;
  return (
    <li
      style={{
        background: T.bg,
        borderRadius: "6px",
        padding: "8px",
        lineHeight: 1.45,
        display: "flex",
        flexDirection: "column",
        gap: SP.sm,
      }}
    >
      <span>
        <strong>{docHeading(doc)}</strong>
        <span style={{ color: T.warning }}>{` · ${issue.kind}`}</span>
      </span>
      <span style={{ userSelect: "text", fontSize: "0.92em" }}>
        {issue.text}
      </span>
      <Row>
        <Button dense onClick={() => void fix(doc.id, issue)}>
          Fix
        </Button>
        <Button
          dense
          tone="quiet"
          onClick={() =>
            store.dispatch(issueDismissed({ docId: doc.id, issueId: issue.id }))
          }
        >
          Dismiss
        </Button>
        <Button
          dense
          tone="quiet"
          onClick={() => store.dispatch(docOpened({ id: doc.id }))}
        >
          Open
        </Button>
      </Row>
    </li>
  );
}
