// Cast: the cast gate. The dossiers and how the cast stand with each other,
// reviewed with the facilitator: who you want scenes with, who is missing, what
// feels wrong against the brief.

import { store, castReviewedSet, type RootState } from "../../../core/store";
import { addDoc } from "../../../core/canon";
import { useSlice } from "../../bridge";
import {
  Button,
  Hint,
  Row,
  SectionTitle,
  StageBody,
} from "../../components/kit";
import { DocCard } from "../DocCard";
import { AddDoc } from "./CanonStage";
import { Facilitator } from "../Facilitator";

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
      <Hint>
        Everyone with a dossier, the protagonist included, and how they stand
        with each other. Read them as a whole: who do you want scenes with, who
        is missing, what misfires?
      </Hint>
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
      <SectionTitle>Talk it through</SectionTitle>
      <Facilitator stage="cast" />
      <SectionTitle>Gate</SectionTitle>
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
    </StageBody>
  );
}
