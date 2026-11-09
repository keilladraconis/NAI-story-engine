// Vignettes: tone anchors drafted on the page. What the scenario must allow,
// never what will happen. "What next" offers the next scene, so the writer
// picks, notes or steers instead of writing a prompt.

import { store, vignetteRemoved, vignetteUpdated } from "../../../core/store";
import { missingBrief } from "../../../core/facilitator";
import { useSlice } from "../../bridge";
import { SP, T } from "../../style";
import { Offers } from "../../components/Offers";
import {
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
  const missing = useSlice((s) => missingBrief(s.canon.brief).join(", "));
  return (
    <StageBody>
      <Hint>
        Short scenes that set the tone: what the scenario must allow, not what
        will happen. Pick a scene below, or say what you want, and Story Engine
        drafts it on the page. Steer it there: edit the direction under the page
        and Retry, or edit the text itself, then save it. Saving offers the next
        scenes.
      </Hint>
      <p
        style={{
          display: missing ? "block" : "none",
          margin: "0 0 8px",
          fontSize: "0.85em",
          color: T.warning,
          lineHeight: 1.5,
        }}
      >
        Finish the brief first (the Talk tab asks for it). Still missing:{" "}
        {missing}.
      </p>
      <SectionTitle>What next</SectionTitle>
      <Offers kind="vignette" blocked={Boolean(missing)} noun="scenes" />
      <SectionTitle>Kept · {ids ? ids.split(",").length : 0}</SectionTitle>
      {(ids ? ids.split(",") : []).map((id) => (
        <VignetteCard key={id} id={id} />
      ))}
    </StageBody>
  );
}
