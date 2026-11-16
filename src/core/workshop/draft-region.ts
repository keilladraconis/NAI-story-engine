// Arithmetic for the draft region: everything after the boundary paragraph.
// Pure, so the editor side stays a thin layer of API calls over it.

/** The draft's section ids, in page order. 0 = the whole page is draft. */
export function draftIds(allIds: number[], boundary: number): number[] {
  if (boundary === 0) return allIds;
  const at = allIds.indexOf(boundary);
  return at === -1 ? [] : allIds.slice(at + 1);
}

/** Is a generation starting in this section writing into the draft? */
export function inDraft(
  allIds: number[],
  boundary: number,
  sectionId: number,
): boolean {
  return draftIds(allIds, boundary).includes(sectionId);
}

/**
 * Where the boundary goes when its paragraph is gone: just before the first
 * paragraph of the last known draft that still exists, or the top of the page.
 * With no known draft paragraph left, the last paragraph on the page stays
 * story and a fresh draft starts after it.
 */
export function recoverBoundary(allIds: number[], lastDraft: number[]): number {
  const first = lastDraft.find((id) => allIds.includes(id));
  if (first !== undefined) {
    const at = allIds.indexOf(first);
    return at > 0 ? allIds[at - 1] : 0;
  }
  return allIds.length ? allIds[allIds.length - 1] : 0;
}

/**
 * Split a starting-point draft on its "Now" and "Not yet" headings. A heading
 * is a line that is only the word(s), optionally with `#`s, a colon or bold.
 * Text before any heading counts as Now.
 */
export function splitStartingPoint(text: string): {
  now: string;
  notYet: string;
} {
  const lines = text.split("\n");
  const now: string[] = [];
  const notYet: string[] = [];
  let into = now;
  for (const line of lines) {
    const bare = line
      .replace(/[#*_:[\]]/g, "")
      .trim()
      .toLowerCase();
    if (bare === "now") {
      into = now;
      continue;
    }
    if (bare === "not yet") {
      into = notYet;
      continue;
    }
    into.push(line);
  }
  return { now: now.join("\n").trim(), notYet: notYet.join("\n").trim() };
}
