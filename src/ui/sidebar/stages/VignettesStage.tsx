// Vignettes: tone anchors drafted on the page. What the scenario must allow,
// never what will happen.

import { store, vignetteRemoved, vignetteUpdated } from "../../../core/store";
import { writeDraft } from "../../../core/workshop/workshop";
import { useSlice } from "../../bridge";
import { SP, T } from "../../style";
import {
  Button,
  Field,
  Hint,
  Row,
  SectionTitle,
  StageBody,
} from "../../components/kit";
import { ConfirmButton } from "../../components/ConfirmButton";

function VignetteCard(props: { id: string }) {
  const v = useSlice((s) => s.canon.vignettes.find((x) => x.id === props.id));
  const [open, setOpen] = useState(false);
  if (!v) return null;
  return (
    <article
      style={{
        border: `1px solid ${T.bg3}`,
        borderRadius: "8px",
        padding: "8px 10px",
        display: "flex",
        flexDirection: "column",
        gap: SP.sm,
        marginBottom: SP.md,
      }}
    >
      <button
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        style={{
          background: "none",
          border: "none",
          padding: 0,
          minHeight: "32px",
          textAlign: "left",
          color: T.text,
          font: "inherit",
          fontWeight: "bold",
          cursor: "pointer",
        }}
      >
        {v.title || "Untitled vignette"}
      </button>
      <div style={{ display: open ? "flex" : "none", flexDirection: "column" }}>
        <Field
          label="Title"
          value={v.title}
          onCommit={(title) =>
            store.dispatch(vignetteUpdated({ id: v.id, title }))
          }
        />
        <Field
          label="Text"
          multiline
          rows={8}
          value={v.text}
          onCommit={(text) =>
            store.dispatch(vignetteUpdated({ id: v.id, text }))
          }
        />
      </div>
      <Row>
        <span style={{ flex: 1 }} />
        <ConfirmButton
          title="Drop this vignette"
          label="Drop"
          onConfirm={() => store.dispatch(vignetteRemoved({ id: v.id }))}
        />
      </Row>
    </article>
  );
}

export function VignettesStage() {
  const ids = useSlice((s) => s.canon.vignettes.map((v) => v.id).join(","));
  return (
    <StageBody>
      <Hint>
        Short scenes that set the tone: what the scenario must allow, not what
        will happen. Draft one on the page with Workshop Sends on, Retry until
        it sounds right, edit it, then save it. Keep a range: tender and tense,
        private and seen.
      </Hint>
      <Row>
        <Button
          tone="primary"
          onClick={() => void writeDraft({ kind: "vignette" })}
        >
          Draft a vignette
        </Button>
      </Row>
      <SectionTitle>Kept · {ids ? ids.split(",").length : 0}</SectionTitle>
      {(ids ? ids.split(",") : []).map((id) => (
        <VignetteCard key={id} id={id} />
      ))}
    </StageBody>
  );
}
