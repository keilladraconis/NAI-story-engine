// Cast: the cast gate. The dossiers and how the cast stand with each other,
// reviewed with the facilitator: who you want scenes with, who is missing, what
// feels wrong against the brief.

import { store, castReviewedSet, type RootState } from "../../../core/store";
import { addDoc } from "../../../core/canon";
import { useSlice } from "../../bridge";
import {
  Button,
  Intro,
  Row,
  SectionTitle,
  StageBody,
} from "../../components/kit";
import { NextStage } from "../NextStage";
import { DocCard } from "../DocCard";
import { AddDoc } from "./CanonStage";

const idsOf = (kind: "dossier" | "relationships") => (s: RootState) =>
  s.canon.docs
    .filter((d) => d.kind === kind)
    .map((d) => d.id)
    .join(",");

const DOSSIERS = idsOf("dossier");
const RELATIONSHIPS = idsOf("relationships");

export function CastStage() {
  const dossiers = useSlice(DOSSIERS);
  const relationships = useSlice(RELATIONSHIPS);
  const reviewed = useSlice((s) => s.canon.castReviewed);

  return (
    <StageBody>
      <Intro
        step={6}
        title="Cast"
        steps={[
          "Open each dossier and read it: body and figures, voice, wants, history, family.",
          'Change what is wrong with Rewrite ("make her two years older"), or add someone with + Dossier and Draft on page.',
          "When these are the people you want scenes with, press Mark the cast reviewed.",
        ]}
      >
        Everyone with a dossier, the protagonist included, and how they stand
        with each other, read as a whole. Each dossier becomes a lorebook
        profile, so get the people right here.
      </Intro>
      <SectionTitle>Dossiers</SectionTitle>
      {(dossiers ? dossiers.split(",") : []).map((id) => (
        <DocCard key={id} id={id} />
      ))}
      <AddDoc kinds={["dossier"]} />
      <SectionTitle>Relationships</SectionTitle>
      {(relationships ? relationships.split(",") : []).map((id) => (
        <DocCard key={id} id={id} />
      ))}
      <div style={{ display: relationships ? "none" : "block" }}>
        <Button dense onClick={() => addDoc("relationships")}>
          + Relationships
        </Button>
      </div>
      <SectionTitle>Done reading?</SectionTitle>
      <Row>
        <Button
          tone={reviewed ? "plain" : "primary"}
          onClick={() =>
            store.dispatch(castReviewedSet({ reviewed: !reviewed }))
          }
        >
          {reviewed ? "✓ Cast reviewed (undo)" : "Mark the cast reviewed"}
        </Button>
      </Row>
      <NextStage from="cast" todo="Mark the cast reviewed when it is right." />
    </StageBody>
  );
}
