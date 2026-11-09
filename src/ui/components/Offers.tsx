// What to draft next, offered: GLM's pitches as pick cards, a note, and the
// two buttons that use them. Shared by Vignettes and Now.
//
// The lit (primary) button is the next thing to do: with nothing picked or
// typed it is the offer button, and drafting is disabled; once there is a pick
// or a note, it is the draft button.

import { store, offerChosen, type OfferKind } from "../../core/store";
import { writeDraft } from "../../core/workshop/workshop";
import { vignetteDirection } from "../../core/workshop/targets";
import {
  OFFERING,
  START_LABEL,
  offer,
  writeStartingPoint,
} from "../../core/offers";
import { useSlice } from "../bridge";
import { SP, T, TOUCH } from "../style";
import { Choice } from "./Choice";
import { Button, Row } from "./kit";

export function Offers(props: {
  kind: OfferKind;
  /** The tab cannot draft yet (the Brief is unfinished). */
  blocked: boolean;
  /** What is offered, plural: "scenes", "starting points". */
  noun: string;
}) {
  const { kind } = props;
  const labels = useSlice((s) =>
    s.runtime.offers[kind].offers.map((o) => o.label).join("\n"),
  );
  const lead = useSlice((s) => s.runtime.offers[kind].lead);
  const picked = useSlice((s) => s.runtime.offers[kind].picked);
  const offering = useSlice((s) =>
    s.runtime.jobs.some((j) => j.label === OFFERING[kind].label),
  );
  // A starting point is written by GLM, not by Sends.
  const starting = useSlice((s) =>
    s.runtime.jobs.some((j) => j.label === START_LABEL),
  );
  const writing = useSlice((s) => s.runtime.autoDraft);
  const [note, setNote] = useState("");
  const offers = labels ? labels.split("\n") : [];
  const chosen = Boolean(picked || note.trim());
  const busy = props.blocked || offering || writing || starting;

  const draft = () => {
    const state = store.getState();
    const set = state.runtime.offers[kind];
    const pitch = set.offers.find((o) => o.label === set.picked)?.description;
    if (kind === "startingPoint") {
      void writeStartingPoint([pitch ?? "", note].join(" "));
    } else {
      void writeDraft({ kind }, vignetteDirection(state, pitch ?? "", note));
    }
    setNote("");
  };
  const steer = () => {
    void offer(kind, note);
    setNote("");
  };

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: SP.md }}>
      <p
        style={{
          display: offering || starting || lead ? "block" : "none",
          margin: 0,
          lineHeight: 1.5,
        }}
      >
        {offering
          ? `Thinking of ${props.noun}…`
          : starting
            ? "Writing it out…"
            : lead}
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
            kind={kind}
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
          picked
            ? "Optional: add to it, then Draft it"
            : offers.length
              ? "Or say what you want: Draft it, or Other ideas to steer"
              : `Optional: steer the ${props.noun}, then Offer`
        }
        onInput={(e) => setNote(e.currentTarget.value ?? "")}
        style={{
          minHeight: TOUCH,
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
          tone={chosen ? "primary" : "plain"}
          disabled={busy || !chosen}
          onClick={draft}
        >
          Draft it
        </Button>
        <Button
          tone={chosen ? "plain" : "primary"}
          disabled={busy}
          onClick={steer}
        >
          {offers.length ? "Other ideas" : `Offer ${props.noun}`}
        </Button>
      </Row>
    </section>
  );
}

function OfferChoice(props: {
  kind: OfferKind;
  index: number;
  picked: boolean;
  live: boolean;
}) {
  const option = useSlice(
    (s) => s.runtime.offers[props.kind].offers[props.index],
  );
  return (
    <Choice
      label={option?.label ?? ""}
      description={option?.description ?? ""}
      picked={props.picked}
      live={props.live}
      onPick={() =>
        option &&
        store.dispatch(offerChosen({ kind: props.kind, label: option.label }))
      }
    />
  );
}
