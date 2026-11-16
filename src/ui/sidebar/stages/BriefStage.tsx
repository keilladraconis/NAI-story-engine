// Brief: what the scenario is, in the writer's terms. Filled by the Talk
// interview or by hand.

import { store, briefUpdated, type Brief } from "../../../core/store";
import { useSlice } from "../../bridge";
import { missingBrief } from "../../../core/facilitator";
import { Field, Intro, StageBody } from "../../components/kit";
import { NextStage } from "../NextStage";

const FIELDS: ReadonlyArray<{
  field: keyof Brief;
  label: string;
  placeholder: string;
  multiline?: boolean;
}> = [
  {
    field: "title",
    label: "Title",
    placeholder: "A title; Talk suggests some",
  },
  {
    field: "genre",
    label: "Genre and tags",
    placeholder: "Genre and a few tags",
  },
  {
    field: "premise",
    label: "Premise",
    placeholder: "Who, where, and the pressure the story lives inside.",
    multiline: true,
  },
  {
    field: "desires",
    label: "Desires",
    placeholder:
      "What the story dwells on: the core, the dynamics, scenes the world must allow.",
    multiline: true,
  },
  {
    field: "world",
    label: "World",
    placeholder: "How the world works: its rules, its tone, who lives in it.",
    multiline: true,
  },
  { field: "voice", label: "Voice", placeholder: "Perspective and tense" },
  {
    field: "heat",
    label: "Heat",
    placeholder: "How explicit it gets",
  },
  { field: "pace", label: "Pace", placeholder: "How quickly things escalate" },
  {
    field: "limits",
    label: "Limits",
    placeholder: "What the story must never do.",
    multiline: true,
  },
  {
    field: "notes",
    label: "Notes",
    placeholder: "Families, details, decisions, anything else.",
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
      rows={props.field === "premise" || props.field === "desires" ? 7 : 3}
      onCommit={(v) => store.dispatch(briefUpdated({ [props.field]: v }))}
    />
  );
}

export function BriefStage() {
  const missing = useSlice((s) => missingBrief(s.canon.brief).join(", "));
  return (
    <StageBody>
      <Intro step={2} title="Brief">
        The scenario in your own terms. Talk writes it as you answer; read it
        over and put anything right here. Every later step is built from it.
      </Intro>
      {FIELDS.map((f) => (
        <BriefField key={f.field} {...f} />
      ))}
      <NextStage
        from="brief"
        todo={`Still to settle: ${missing}. Talk asks about each, or fill them in above.`}
      />
    </StageBody>
  );
}
