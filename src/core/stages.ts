// The six stages and when each counts as done. A done stage gets a check in the
// tab strip; the writer can open any stage at any time.

import type { CanonDoc, DocKind, RootState, StageId } from "./store/types";
import { hashText } from "./text";
import { interviewDone } from "./facilitator";

export const STAGES: ReadonlyArray<{ id: StageId; label: string }> = [
  { id: "talk", label: "Talk" },
  { id: "brief", label: "Brief" },
  { id: "vignettes", label: "Vignettes" },
  { id: "now", label: "Now" },
  { id: "canon", label: "Canon" },
  { id: "cast", label: "Cast" },
  { id: "distill", label: "Distill" },
];

/** Canon kinds the Canon stage needs before it is done (plus one dossier). */
export const REQUIRED_KINDS: readonly DocKind[] = [
  "geography",
  "culture",
  "tensions",
  "relationships",
  "locations",
  "plots",
];

export function missingKinds(state: RootState): DocKind[] {
  const present = new Set(state.canon.docs.map((d) => d.kind));
  const missing = REQUIRED_KINDS.filter((k) => !present.has(k));
  if (!present.has("dossier")) missing.push("dossier");
  return missing;
}

/** Is the document's review of the text it holds now? */
export function reviewCurrent(doc: CanonDoc): boolean {
  return doc.review?.textHash === hashText(doc.text);
}

/** Issues from current reviews: a review of text since changed no longer counts. */
export function openIssueCount(state: RootState): number {
  return state.canon.docs.reduce(
    (n, d) => n + (reviewCurrent(d) ? (d.review?.issues.length ?? 0) : 0),
    0,
  );
}

export function stageDone(state: RootState, stage: StageId): boolean {
  const { canon } = state;
  switch (stage) {
    case "talk":
      return interviewDone(canon.brief);
    case "brief":
      return interviewDone(canon.brief);
    case "vignettes":
      return canon.vignettes.length > 0;
    case "now":
      return Boolean(canon.startingPoint.now.trim());
    case "canon":
      return (
        missingKinds(state).length === 0 &&
        canon.docs.every((d) => !d.text.trim() || reviewCurrent(d)) &&
        openIssueCount(state) === 0
      );
    case "cast":
      return canon.castReviewed;
    case "distill":
      return state.distill.openingKept;
  }
}
