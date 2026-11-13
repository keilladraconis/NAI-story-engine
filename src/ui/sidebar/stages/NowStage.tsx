// Now: where the story begins. Two ledgers: what is true at the first page, and
// what the vignettes show that has not happened yet. The canon is written as of
// Now, and no document may write a Not-yet state as present.

import { store, startingPointSet } from "../../../core/store";
import { openOnPage } from "../../../core/workshop/workshop";
import { missingBrief } from "../../../core/facilitator";
import { useSlice } from "../../bridge";
import {
  Button,
  Field,
  Intro,
  Row,
  SectionTitle,
  StageBody,
} from "../../components/kit";
import { NextStage } from "../NextStage";
import { Offers } from "../../components/Offers";

export function NowStage() {
  const now = useSlice((s) => s.canon.startingPoint.now);
  const notYet = useSlice((s) => s.canon.startingPoint.notYet);
  const set = (patch: { now?: string; notYet?: string }) =>
    store.dispatch(startingPointSet({ now, notYet, ...patch }));
  const hasText = Boolean(now.trim() || notYet.trim());
  const missing = useSlice((s) => missingBrief(s.canon.brief).length > 0);

  return (
    <StageBody>
      <Intro
        step={4}
        title="Now"
        steps={[
          "Pick a starting point below, or describe one, and press Draft it.",
          "It is put on the page. Edit it there, then press Save starting point in the toolbar above the editor. Or type the two fields below by hand.",
        ]}
      >
        Where the story begins: what is true at the first page, and what the
        vignettes show that has not happened yet. The canon is written as of
        this moment, so a vignette's ending never becomes the opening.
      </Intro>
      <SectionTitle>Starting points</SectionTitle>
      <Offers kind="startingPoint" blocked={missing} noun="starting points" />
      <div style={{ display: hasText ? "block" : "none", marginTop: "8px" }}>
        <Row>
          <Button
            onClick={() =>
              void openOnPage(
                { kind: "startingPoint" },
                `Now\n${now.trim()}\n\nNot yet\n${notYet.trim()}`,
              )
            }
          >
            Open on page
          </Button>
        </Row>
      </div>
      <div style={{ height: "8px" }} />
      <Field
        label="Now: true at the first page"
        multiline
        rows={6}
        value={now}
        onCommit={(v) => set({ now: v })}
      />
      <Field
        label="Not yet: earned through play"
        multiline
        rows={5}
        value={notYet}
        onCommit={(v) => set({ notYet: v })}
      />
      <NextStage from="now" todo="Write what is true at the first page." />
    </StageBody>
  );
}
