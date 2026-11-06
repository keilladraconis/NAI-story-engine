// Brief: what the scenario is, in the writer's terms. Filled by hand, or from
// the facilitator chat below it.

import { store, briefUpdated, type Brief } from "../../../core/store";
import { useSlice } from "../../bridge";
import { Field, Hint, SectionTitle, StageBody } from "../../components/kit";
import { Facilitator } from "../Facilitator";

const FIELDS: ReadonlyArray<{
  field: keyof Brief;
  label: string;
  placeholder: string;
  multiline?: boolean;
}> = [
  { field: "title", label: "Title", placeholder: "The Keeper's Daughter" },
  {
    field: "genre",
    label: "Genre and tags",
    placeholder: "Literary; lighthouse, family, debt",
  },
  {
    field: "premise",
    label: "Premise",
    placeholder: "Who, where, and the pressure the story lives inside.",
    multiline: true,
  },
  { field: "voice", label: "Voice", placeholder: "Third limited, past" },
  {
    field: "heat",
    label: "Heat",
    placeholder: "Tender, suggestive, explicit…",
  },
  { field: "pace", label: "Pace", placeholder: "Slow, carried by silence" },
  {
    field: "limits",
    label: "Limits",
    placeholder: "What the story must never do.",
    multiline: true,
  },
  {
    field: "notes",
    label: "Notes",
    placeholder: "Desires, scenes you want the world to allow, anything else.",
    multiline: true,
  },
];

function BriefField(props: (typeof FIELDS)[number]) {
  const value = useSlice((s) => s.canon.brief[props.field]);
  return (
    <Field
      label={props.label}
      value={value}
      placeholder={props.placeholder}
      multiline={props.multiline}
      onCommit={(v) => store.dispatch(briefUpdated({ [props.field]: v }))}
    />
  );
}

export function BriefStage() {
  return (
    <StageBody>
      <Hint>
        What the scenario is. Premise and voice are what the rest is built from;
        the other fields can wait.
      </Hint>
      {FIELDS.map((f) => (
        <BriefField key={f.field} {...f} />
      ))}
      <SectionTitle>Talk it through</SectionTitle>
      <Facilitator stage="brief" />
    </StageBody>
  );
}
