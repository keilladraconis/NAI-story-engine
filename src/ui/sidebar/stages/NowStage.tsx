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
  Hint,
  Row,
  SectionTitle,
  StageBody,
} from "../../components/kit";
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
      <Hint>
        Where the story begins. Without it, the canon starts wherever its prose
        is most vivid, and a vignette's ending becomes the opening. Pick a
        starting point to draft on the page, edit it there, then save it.
      </Hint>
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
    </StageBody>
  );
}
