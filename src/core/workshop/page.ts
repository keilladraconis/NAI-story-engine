// The draft region on the page: everything after the boundary paragraph,
// marked by a divider widget and a tint on each draft paragraph.
//
// Measured in NovelAI (tools/surfaces-probe.naiscript): a native Send continues
// the LAST paragraph, so the draft always holds a paragraph of its own; widgets
// and markers do not survive a reload, so they are redrawn from the stored
// boundary; deleting the boundary paragraph disposes the widget, so the
// boundary is recovered from the draft it last saw.

import {
  store,
  boundaryMoved,
  workshopTurnedOn,
  workshopTurnedOff,
} from "../store";
import { draftIds, recoverBoundary } from "./draft-region";

const TINT = { backgroundColor: "rgba(128, 128, 128, 0.08)" };

let widget: { dispose(): Promise<void> } | null = null;
let markers: { dispose(): Promise<void> }[] = [];
/** The draft paragraphs as of the last redraw, for recovering a lost boundary. */
let lastDraft: number[] = [];
/** Set while we dispose our own widget, so its dispose event is not a deletion. */
let disposing = false;
/** Widget content, supplied by the UI at startup (core does not import the UI). */
let widgetContent: () => UIPart[] = () => [];

export function setWidgetContent(build: () => UIPart[]): void {
  widgetContent = build;
}

/** Serialises page work: redraws and edits must not interleave. */
let chain: Promise<unknown> = Promise.resolve();
function serial<T>(work: () => Promise<T>): Promise<T> {
  const next = chain.then(work, work);
  chain = next.catch(() => undefined);
  return next;
}

async function sections() {
  return api.v1.document.scan();
}

/** The current draft's section ids, or [] when Workshop Sends are off. */
export async function currentDraftIds(): Promise<number[]> {
  const { boundary } = store.getState().workshop;
  if (boundary === null) return [];
  return draftIds(await api.v1.document.sectionIds(), boundary);
}

/** The draft exactly as on the page, paragraphs joined with newlines. */
async function draftRaw(): Promise<string> {
  const ids = new Set(await currentDraftIds());
  if (!ids.size) return "";
  return (await sections())
    .filter((s) => ids.has(s.sectionId))
    .map((s) => s.section.text)
    .join("\n");
}

/** The draft's text, trimmed; "" when empty. */
export async function draftText(): Promise<string> {
  return withoutTrailingBreak(await draftRaw());
}

/**
 * The draft as a Send's prefill: as on the page down to a trailing empty
 * paragraph, since NovelAI writes the reply into the last paragraph. Trimmed,
 * a draft ending in an empty paragraph read as a sentence to go on with, and
 * the rest of the sentence landed on a line of its own.
 */
export async function draftPrefill(): Promise<string> {
  const raw = (await draftRaw()).trimStart();
  return raw.trim() ? raw : "";
}

/**
 * Trim a draft, dropping a scene break or the start of a bracketed line at its
 * end: what is left when a Draft button stops the model as it begins the next
 * piece.
 */
export function withoutTrailingBreak(text: string): string {
  return text
    .trim()
    .replace(/\n\s*(\*{3}|⁂|-{3,}|\[[^\]\n]*)\s*$/, "")
    .trim();
}

async function clearDecorations(): Promise<void> {
  disposing = true;
  try {
    await Promise.all([widget?.dispose(), ...markers.map((m) => m.dispose())]);
  } finally {
    disposing = false;
    widget = null;
    markers = [];
  }
}

async function onBoundaryLost(): Promise<void> {
  const boundary = recoverBoundary(
    await api.v1.document.sectionIds(),
    lastDraft,
  );
  store.dispatch(boundaryMoved({ boundary }));
  // Already inside the serial chain: draw directly, never queue behind ourselves.
  await draw();
}

async function draw(): Promise<void> {
  await clearDecorations();
  const { on, boundary } = store.getState().workshop;
  if (!on || boundary === null) return;
  const ids = await api.v1.document.sectionIds();
  if (boundary !== 0 && !ids.includes(boundary)) {
    // The boundary paragraph went while nothing was watching (a reload, an undo).
    store.dispatch(
      boundaryMoved({ boundary: recoverBoundary(ids, lastDraft) }),
    );
    return draw();
  }
  lastDraft = draftIds(ids, boundary);
  // Plain content only: a row wrapper or `display` made createWidget refuse its
  // options in the probe.
  if (boundary === 0) {
    // A node widget "before the first section" does not render, and with no
    // story above there is nothing to lose: sit inline at the draft's start.
    widget = lastDraft.length
      ? await api.v1.editor.decorations.createWidget({
          type: "inline",
          position: { sectionId: lastDraft[0], offset: 0 },
          side: "before",
          content: widgetContent(),
        })
      : null;
  } else {
    widget = await api.v1.editor.decorations.createWidget({
      type: "node",
      sectionId: boundary,
      content: widgetContent(),
      onChange: (event) => {
        if (event.type === "dispose" && !disposing) void serial(onBoundaryLost);
      },
    });
  }
  markers = lastDraft.length
    ? await api.v1.editor.decorations.createMarkers(
        lastDraft.map((sectionId) => ({
          type: "node" as const,
          sectionId,
          style: TINT,
        })),
      )
    : [];
}

/** Redraw the divider and tint from the store. Safe to call any time. */
export function redraw(): Promise<void> {
  return serial(draw);
}

/**
 * Turn Workshop Sends on: the last paragraph with text becomes the boundary,
 * and an empty paragraph after it starts the draft. On an empty page a blank
 * line is the boundary: an inline divider at the draft's start sat over
 * NovelAI's "Enter your prompt here" placeholder, and the blank line gives the
 * divider a paragraph of its own to follow.
 */
export function turnOn(): Promise<void> {
  return serial(async () => {
    if (store.getState().workshop.on) return;
    let all = await sections();
    if (!all.length) {
      await api.v1.document.appendParagraph({ text: "" });
      all = await sections();
    }
    const withText = all.filter((s) => s.section.text.trim());
    const boundary = (withText.length ? withText[withText.length - 1] : all[0])
      .sectionId;
    const after = draftIds(
      all.map((s) => s.sectionId),
      boundary,
    );
    if (!after.length)
      await api.v1.document.insertParagraphAfter(boundary, { text: "" });
    store.dispatch(workshopTurnedOn({ boundary }));
    await draw();
  });
}

/**
 * Turn Workshop Sends off. Refused while the draft holds text, which would
 * otherwise become story text unnoticed. Returns whether it turned off.
 */
export function turnOff(): Promise<boolean> {
  return serial(async () => {
    if (!store.getState().workshop.on) return true;
    if (await draftText()) return false;
    const empty = await currentDraftIds();
    if (empty.length) await api.v1.document.removeParagraphs(empty);
    store.dispatch(workshopTurnedOff());
    await clearDecorations();
    return true;
  });
}

/** Remove the draft and leave one empty paragraph to write into. */
export function clearDraft(): Promise<void> {
  return serial(async () => {
    const { boundary } = store.getState().workshop;
    if (boundary === null) return;
    const ids = await currentDraftIds();
    // Keep one paragraph and empty it, rather than removing every paragraph
    // and inserting a new one: the boundary stays valid throughout.
    if (ids.length > 1) await api.v1.document.removeParagraphs(ids.slice(1));
    if (ids.length) await api.v1.document.updateParagraph(ids[0], { text: "" });
    else if (boundary === 0)
      await api.v1.document.appendParagraph({ text: "" });
    else await api.v1.document.insertParagraphAfter(boundary, { text: "" });
    await draw();
  });
}

/** Put a saved text into the (empty) draft so Sends continue it. */
export function putOnPage(text: string): Promise<void> {
  return serial(async () => {
    const { boundary } = store.getState().workshop;
    if (boundary === null) return;
    const ids = await currentDraftIds();
    const lines = text.split("\n");
    if (ids.length) {
      await api.v1.document.updateParagraph(ids[0], { text: lines[0] ?? "" });
      if (ids.length > 1) await api.v1.document.removeParagraphs(ids.slice(1));
      if (lines.length > 1)
        await api.v1.document.insertParagraphsAfter(
          ids[0],
          lines.slice(1).map((t) => ({ text: t })),
        );
    } else if (boundary === 0) {
      await api.v1.document.appendParagraphs(lines.map((t) => ({ text: t })));
    } else {
      await api.v1.document.insertParagraphsAfter(
        boundary,
        lines.map((t) => ({ text: t })),
      );
    }
    await draw();
  });
}

/**
 * The opening is kept where it is: the draft becomes story text, the divider
 * and tint go, and Workshop Sends turn off.
 */
export function keepDraftAsStory(): Promise<void> {
  return serial(async () => {
    store.dispatch(workshopTurnedOff());
    await clearDecorations();
  });
}

/**
 * The text up to its last sentence end (a full stop, ! or ?, with any closing
 * quote or bracket), or the text unchanged when it has none.
 */
export function toSentenceEnd(text: string): string {
  const match = text.match(/^[\s\S]*[.!?…]["'”’)\]]*/);
  return match ? match[0] : text;
}

/** Does the text stop mid-sentence: on a word, a number, a comma or a dash? */
export function midSentence(text: string): boolean {
  return /[\p{L}\p{N},;—–-]\s*$/u.test(text);
}

/**
 * Before a Send: drop the empty paragraphs after a draft that stops
 * mid-sentence. NovelAI writes the reply into the last paragraph, and the model
 * goes on with the sentence whatever follows it: the rest of the sentence
 * landed on a line of its own, and shown the line break, the model wrapped
 * every line after it. After a finished sentence an empty paragraph is a new
 * paragraph begun, and stays.
 */
export function joinUnfinishedSentence(): Promise<void> {
  return serial(async () => {
    const stray = await strayParagraphs();
    if (!stray.length) return;
    await api.v1.document.removeParagraphs(stray);
    await draw();
  });
}

/** Does the draft end mid-sentence followed by empty paragraphs? */
export async function strayLineBreak(): Promise<boolean> {
  return (await strayParagraphs()).length > 0;
}

/** The empty paragraphs after a draft that stops mid-sentence. */
async function strayParagraphs(): Promise<number[]> {
  const ids = await currentDraftIds();
  const draft = (await sections()).filter((s) => ids.includes(s.sectionId));
  let last = draft.length - 1;
  while (last >= 0 && !draft[last].section.text.trim()) last--;
  if (last === -1 || last === draft.length - 1) return [];
  if (!midSentence(draft[last].section.text)) return [];
  return draft.slice(last + 1).map((s) => s.sectionId);
}

/**
 * What a Send stopped at the next piece leaves behind: the first characters of
 * a scene break, divider or bracketed line, which went to the page before the
 * marker was whole.
 */
const BREAK_RESIDUE = /^\s*(\*{1,3}|⁂|-{1,4}|\[|#+)\s*$/;

/** Empty a last paragraph that holds only the start of a break. */
export function dropBreakResidue(): Promise<void> {
  return serial(async () => {
    const ids = new Set(await currentDraftIds());
    const last = (await sections())
      .filter((s) => ids.has(s.sectionId) && s.section.text.trim())
      .pop();
    if (last && BREAK_RESIDUE.test(last.section.text))
      await api.v1.document.updateParagraph(last.sectionId, { text: "" });
  });
}

/** Trim a half-written last sentence off the draft. */
export function endOnSentence(): Promise<void> {
  return serial(async () => {
    const ids = new Set(await currentDraftIds());
    const last = (await sections())
      .filter((s) => ids.has(s.sectionId) && s.section.text.trim())
      .pop();
    if (!last) return;
    const trimmed = toSentenceEnd(last.section.text);
    if (trimmed !== last.section.text)
      await api.v1.document.updateParagraph(last.sectionId, { text: trimmed });
  });
}
