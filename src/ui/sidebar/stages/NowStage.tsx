// Now: where the story begins. Two ledgers: what is true at the first page, and
// what the vignettes show that has not happened yet. The canon is written as of
// Now, and no document may write a Not-yet state as present.

import { store, startingPointSet } from "../../../core/store";
import { draftOnPage, openOnPage } from "../../../core/workshop/workshop";
import { useSlice } from "../../bridge";
import { Button, Field, Hint, Row, StageBody } from "../../components/kit";

export function NowStage() {
  const now = useSlice((s) => s.canon.startingPoint.now);
  const notYet = useSlice((s) => s.canon.startingPoint.notYet);
  const set = (patch: { now?: string; notYet?: string }) =>
    store.dispatch(startingPointSet({ now, notYet, ...patch }));
  const hasText = Boolean(now.trim() || notYet.trim());

  return (
    <StageBody>
      <Hint>
        Where the story begins. Without it, the canon starts wherever its prose
        is most vivid, and a vignette's ending becomes the opening. Name plainly
        what has not happened yet.
      </Hint>
      <Row>
        <Button
          tone="primary"
          onClick={() =>
            void (hasText
              ? openOnPage(
                  { kind: "startingPoint" },
                  `Now\n${now.trim()}\n\nNot yet\n${notYet.trim()}`,
                )
              : draftOnPage({ kind: "startingPoint" }))
          }
        >
          {hasText ? "Open on page" : "Draft on page"}
        </Button>
      </Row>
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
