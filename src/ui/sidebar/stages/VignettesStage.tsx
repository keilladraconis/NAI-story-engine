// Vignettes: tone anchors drafted on the page. What the scenario must allow,
// never what will happen. "What next" offers the next scene, so the writer
// picks, notes or steers instead of writing a prompt.

import {
  store,
  offerChosen,
  vignetteRemoved,
  vignetteUpdated,
} from "../../../core/store";
import { writeDraft } from "../../../core/workshop/workshop";
import { vignetteDirection } from "../../../core/workshop/targets";
import { missingBrief } from "../../../core/facilitator";
import { OFFER_LABEL, offerVignettes } from "../../../core/offers";
import { useSlice } from "../../bridge";
import { SP, T } from "../../style";
import { Choice } from "../../components/Choice";
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

/** The offers for the next vignette, a note, and the buttons that use them. */
function WhatNext(props: { blocked: boolean }) {
  const labels = useSlice((s) =>
    s.runtime.offers.map((o) => o.label).join("\n"),
  );
  const lead = useSlice((s) => s.runtime.offerLead);
  const picked = useSlice((s) => s.runtime.offerPicked);
  const offering = useSlice((s) =>
    s.runtime.jobs.some((j) => j.label === OFFER_LABEL),
  );
  const writing = useSlice((s) => s.runtime.autoDraft);
  const [note, setNote] = useState("");
  const offers = labels ? labels.split("\n") : [];

  const draft = () => {
    const state = store.getState();
    const pitch =
      state.runtime.offers.find((o) => o.label === state.runtime.offerPicked)
        ?.description ?? "";
    void writeDraft(
      { kind: "vignette" },
      vignetteDirection(state, pitch, note),
    );
    setNote("");
  };
  const steer = () => {
    void offerVignettes(note);
    setNote("");
  };

  return (
    <section
      aria-label="What next"
      style={{ display: "flex", flexDirection: "column", gap: SP.md }}
    >
      <SectionTitle>What next</SectionTitle>
      <p
        style={{
          display: offering || lead ? "block" : "none",
          margin: 0,
          lineHeight: 1.5,
        }}
      >
        {offering ? "Thinking of scenes…" : lead}
      </p>
      <div
        style={{
          display: offers.length ? "flex" : "none",
          flexWrap: "wrap",
          gap: SP.sm,
        }}
      >
        {offers.map((label, i) => (
          <OfferChoice
            key={i}
            index={i}
            picked={label === picked}
            live={!offering && !writing}
          />
        ))}
      </div>
      <input
        aria-label="Your note"
        type="text"
        value={note}
        placeholder={
          picked ? "Add to it, or leave as is" : "Or say what you want to see"
        }
        onInput={(e) => setNote(e.currentTarget.value ?? "")}
        style={{
          minHeight: "44px",
          boxSizing: "border-box",
          padding: "0 10px",
          borderRadius: "6px",
          border: `1px solid ${T.bg3}`,
          background: T.bg,
          color: T.text,
          font: "inherit",
        }}
      />
      <Row>
        <Button
          tone="primary"
          disabled={props.blocked || writing}
          onClick={draft}
        >
          {picked || note.trim() ? "Draft it" : "Draft a vignette"}
        </Button>
        <Button disabled={props.blocked || offering} onClick={steer}>
          {offers.length ? "Other ideas" : "Offer scenes"}
        </Button>
      </Row>
    </section>
  );
}

function OfferChoice(props: { index: number; picked: boolean; live: boolean }) {
  const offer = useSlice((s) => s.runtime.offers[props.index]);
  return (
    <Choice
      label={offer?.label ?? ""}
      description={offer?.description ?? ""}
      picked={props.picked}
      live={props.live}
      onPick={() =>
        offer && store.dispatch(offerChosen({ label: offer.label }))
      }
    />
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
      <WhatNext blocked={Boolean(missing)} />
      <SectionTitle>Kept · {ids ? ids.split(",").length : 0}</SectionTitle>
      {(ids ? ids.split(",") : []).map((id) => (
        <VignetteCard key={id} id={id} />
      ))}
    </StageBody>
  );
}
