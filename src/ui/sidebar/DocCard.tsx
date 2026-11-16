// One canon document: a header row, a body that unfolds under it with the
// text and the ways to change it, and its open issues listed last (Fix,
// Dismiss, Open). Open unfolds the body in place, just above the issues, since
// NovelAI gives a script no way to scroll to it. Shared by the Canon and Cast
// stages.

import {
  store,
  docOpened,
  docTextSet,
  docTitleSet,
  issueDismissed,
  type CanonDoc,
} from "../../core/store";
import { reviewCurrent } from "../../core/stages";
import { review, fix, fixAll, rewriteWith } from "../../core/critic";
import { deleteDoc } from "../../core/canon";
import { openOnPage, writeDraft } from "../../core/workshop/workshop";
import { KINDS } from "../../core/workshop/targets";
import { useSlice } from "../bridge";
import { DENSE, SP, T } from "../style";
import { Button, Field, Pill, Row } from "../components/kit";
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

const toggle = (id: string, open: boolean) =>
  store.dispatch(docOpened({ id: open ? null : id }));

function Issues(props: { doc: CanonDoc; open: boolean }) {
  const { doc } = props;
  const issues = reviewCurrent(doc) ? (doc.review?.issues ?? []) : [];
  return (
    <ul
      style={{
        listStyle: "none",
        margin: 0,
        padding: `0 8px 8px`,
        display: issues.length ? "flex" : "none",
        flexDirection: "column",
        gap: SP.md,
      }}
    >
      <li
        style={{
          display: issues.length > 1 ? "flex" : "none",
          flexWrap: "wrap",
          alignItems: "center",
          gap: SP.md,
        }}
      >
        <span style={{ flex: "1 1 140px", fontSize: "0.85em", opacity: 0.8 }}>
          Fix all resolves them in one rewrite; or work through them one by one.
        </span>
        <Button dense tone="primary" onClick={() => void fixAll(doc.id)}>
          {`Fix all ${issues.length}`}
        </Button>
      </li>
      {issues.map((issue) => (
        <li
          key={issue.id}
          style={{
            background: T.bg,
            borderRadius: "6px",
            borderLeft: `3px solid ${T.warning}`,
            padding: "8px 10px",
            lineHeight: 1.45,
            display: "flex",
            flexDirection: "column",
            gap: SP.md,
          }}
        >
          <span>
            <span
              style={{
                color: T.warning,
                fontSize: "0.72em",
                fontWeight: "bold",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              {issue.kind}
            </span>
            <span
              style={{
                display: "block",
                marginTop: SP.xs,
                userSelect: "text",
                fontSize: "0.92em",
              }}
            >
              {issue.text}
            </span>
          </span>
          <Row>
            <Button
              dense
              tone={issues.length > 1 ? "plain" : "primary"}
              onClick={() => void fix(doc.id, issue)}
            >
              Fix
            </Button>
            <Button
              dense
              onClick={() =>
                store.dispatch(
                  issueDismissed({ docId: doc.id, issueId: issue.id }),
                )
              }
            >
              Dismiss
            </Button>
            <Button
              dense
              tone="quiet"
              onClick={() => toggle(doc.id, props.open)}
            >
              {props.open ? "Close ▴" : "Open ▾"}
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
  const accent =
    status.tone === "warn"
      ? T.warning
      : status.tone === "good"
        ? T.good
        : T.bg3;

  return (
    <article
      style={{
        background: T.bg1,
        border: `1px solid ${open ? T.bg3 : "transparent"}`,
        borderLeft: `3px solid ${accent}`,
        borderRadius: "8px",
        marginBottom: SP.md,
      }}
    >
      <button
        aria-expanded={open}
        onClick={() => toggle(doc.id, open)}
        style={{
          width: "100%",
          minHeight: DENSE,
          display: "flex",
          alignItems: "center",
          gap: SP.md,
          padding: "4px 8px",
          background: "none",
          border: "none",
          color: T.text,
          font: "inherit",
          textAlign: "left",
          cursor: "pointer",
        }}
      >
        <span aria-hidden="true" style={{ width: "1em", opacity: 0.6 }}>
          {open ? "▾" : "▸"}
        </span>
        <span
          style={{
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontWeight: "bold",
          }}
        >
          {doc.title}
          <span
            style={{
              display: named ? "inline" : "none",
              marginLeft: SP.md,
              fontWeight: "normal",
              fontSize: "0.8em",
              opacity: 0.6,
            }}
          >
            {KINDS[doc.kind].noun}
          </span>
        </span>
        <Pill tone={status.tone === "dim" ? undefined : status.tone}>
          {status.text}
        </Pill>
      </button>
      <div
        style={{
          display: open ? "flex" : "none",
          flexDirection: "column",
          gap: SP.md,
          padding: `${SP.sm} 8px 8px`,
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
                : writeDraft({ kind: "doc", docId: doc.id }, undefined, true))
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
      <Issues doc={doc} open={open} />
    </article>
  );
}
