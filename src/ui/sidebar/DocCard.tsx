// One canon document: a row that opens into its text, its review, and the ways
// to change it. Shared by the Canon and Cast stages.

import {
  store,
  docOpened,
  docTextSet,
  docTitleSet,
  issueDismissed,
  type CanonDoc,
} from "../../core/store";
import { reviewCurrent } from "../../core/stages";
import { review, fix, rewriteWith } from "../../core/critic";
import { deleteDoc } from "../../core/canon";
import { openOnPage, writeDraft } from "../../core/workshop/workshop";
import { useSlice } from "../bridge";
import { DENSE, SP, T } from "../style";
import { Button, Field, Row, Status } from "../components/kit";
import { ConfirmButton } from "../components/ConfirmButton";

export function docStatus(doc: CanonDoc): {
  tone: "good" | "warn" | "dim";
  text: string;
} {
  if (!doc.text.trim()) return { tone: "dim", text: "empty" };
  if (!reviewCurrent(doc)) return { tone: "dim", text: "not reviewed" };
  const n = doc.review?.issues.length ?? 0;
  return n
    ? { tone: "warn", text: `${n} ${n === 1 ? "issue" : "issues"}` }
    : { tone: "good", text: "✓ reviewed" };
}

function Issues(props: { doc: CanonDoc }) {
  const { doc } = props;
  const issues = reviewCurrent(doc) ? (doc.review?.issues ?? []) : [];
  return (
    <ul
      style={{
        listStyle: "none",
        margin: 0,
        padding: 0,
        display: issues.length ? "flex" : "none",
        flexDirection: "column",
        gap: SP.sm,
      }}
    >
      {issues.map((issue) => (
        <li
          key={issue.id}
          style={{
            background: T.bg,
            borderRadius: "6px",
            padding: "8px",
            lineHeight: 1.45,
          }}
        >
          <strong style={{ color: T.warning }}>{issue.kind}. </strong>
          <span style={{ userSelect: "text" }}>{issue.text}</span>
          <Row>
            <Button dense onClick={() => void fix(doc.id, issue)}>
              Fix
            </Button>
            <Button
              dense
              tone="quiet"
              onClick={() =>
                store.dispatch(
                  issueDismissed({ docId: doc.id, issueId: issue.id }),
                )
              }
            >
              Dismiss
            </Button>
          </Row>
        </li>
      ))}
    </ul>
  );
}

function Rewrite(props: { docId: string }) {
  const [text, setText] = useState("");
  const go = () => {
    const ask = text.trim();
    if (!ask) return;
    setText("");
    void rewriteWith(props.docId, ask);
  };
  return (
    <Row>
      <input
        type="text"
        aria-label="Rewrite instruction"
        value={text}
        placeholder="Rewrite: e.g. make him two years older"
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
      <Button dense onClick={go}>
        Rewrite
      </Button>
    </Row>
  );
}

export function DocCard(props: { id: string }) {
  const doc = useSlice((s) => s.canon.docs.find((d) => d.id === props.id));
  const open = useSlice((s) => s.ui.openDocId === props.id);
  if (!doc) return null;
  const status = docStatus(doc);
  const named = doc.kind === "dossier" || doc.kind === "system";
  const hasText = Boolean(doc.text.trim());

  return (
    <article
      style={{
        border: `1px solid ${open ? T.bg3 : "transparent"}`,
        background: open ? T.bg1 : "transparent",
        borderRadius: "8px",
        marginBottom: SP.xs,
      }}
    >
      <button
        aria-expanded={open}
        onClick={() => store.dispatch(docOpened({ id: open ? null : doc.id }))}
        style={{
          width: "100%",
          minHeight: "40px",
          display: "flex",
          alignItems: "center",
          gap: SP.md,
          padding: "0 8px",
          background: "none",
          border: "none",
          color: T.text,
          font: "inherit",
          textAlign: "left",
          cursor: "pointer",
        }}
      >
        <span
          style={{
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {doc.title}
        </span>
        <Status tone={status.tone}>{status.text}</Status>
      </button>
      <div
        style={{
          display: open ? "flex" : "none",
          flexDirection: "column",
          gap: SP.md,
          padding: `0 8px 8px`,
        }}
      >
        {named ? (
          <Field
            label={doc.kind === "dossier" ? "Name" : "Title"}
            value={doc.title}
            onCommit={(title) =>
              title.trim() &&
              store.dispatch(docTitleSet({ id: doc.id, title: title.trim() }))
            }
          />
        ) : null}
        <Row>
          <Button
            dense
            tone="primary"
            onClick={() =>
              void (hasText
                ? openOnPage({ kind: "doc", docId: doc.id }, doc.text)
                : writeDraft({ kind: "doc", docId: doc.id }))
            }
          >
            {hasText ? "Open on page" : "Draft on page"}
          </Button>
          <Button dense disabled={!hasText} onClick={() => void review(doc.id)}>
            {doc.review ? "Critique again" : "Critique"}
          </Button>
          <span style={{ flex: 1 }} />
          <ConfirmButton
            title={`Delete ${doc.title}`}
            onConfirm={() => void deleteDoc(doc.id)}
          />
        </Row>
        <Issues doc={doc} />
        <div style={{ display: hasText ? "block" : "none" }}>
          <Rewrite docId={doc.id} />
        </div>
        <Field
          label="Text"
          multiline
          rows={10}
          value={doc.text}
          onCommit={(text) => store.dispatch(docTextSet({ id: doc.id, text }))}
        />
      </div>
    </article>
  );
}
