// Workshop commands and the editor hooks that make a Send a workshop Send.

import {
  store,
  targetSet,
  vignetteAdded,
  startingPointSet,
  docTextSet,
  openingKeptSet,
  autoDraftSet,
  directionPreset,
  offerUnpicked,
  type RootState,
  type Target,
} from "../store";
import { firstLine } from "../text";
import { offer } from "../offers";
import { buildFrame, docHeading } from "./frames";
import { replaceContext, directOnly, opener } from "./context";
import { inDraft, splitStartingPoint } from "./draft-region";
import {
  turnOn,
  turnOff,
  draftText,
  clearDraft,
  putOnPage,
  keepDraftAsStory,
  redraw,
  endOnSentence,
} from "./page";
import { defaultDirection, findDoc, sameTarget, targetLabel } from "./targets";

const toast = (message: string) =>
  void api.v1.ui.toast(message, { type: "info" });

// ── Direction ────────────────────────────────────────────────────────────────
// What the writer typed in the direction box. Held here, not in the store: it
// changes per keystroke, and only a Send reads it. A command that fills the
// box (a new target, an offer drafted) presets it through the store, so the
// box shows what the Send will be told.

let direction = "";
export function setDirection(text: string): void {
  direction = text;
}
function presetDirection(text: string): void {
  direction = text;
  store.dispatch(directionPreset({ text }));
}
export function getDirection(): string {
  return direction;
}

function directionFor(target: Target): string {
  return direction.trim() || defaultDirection(store.getState(), target);
}

// ── Commands ─────────────────────────────────────────────────────────────────

export async function setWorkshopOn(on: boolean): Promise<void> {
  if (on) return turnOn();
  if (!(await turnOff())) {
    toast("Save the draft or clear it before turning Workshop Sends off.");
  }
}

/**
 * Choose what Sends draft. Refused while the draft holds text: a half-written
 * vignette must not become the start of a dossier. Returns whether it changed.
 */
export async function chooseTarget(target: Target): Promise<boolean> {
  const current = store.getState().workshop.target;
  if (sameTarget(current, target)) return true;
  if (store.getState().workshop.on && (await draftText())) {
    toast(
      `Save or clear the ${targetLabel(store.getState(), current).toLowerCase()} draft first.`,
    );
    return false;
  }
  store.dispatch(targetSet(target));
  presetDirection("");
  await redraw();
  return true;
}

let saving = false;

/** File the draft under the target and clear it. */
export async function saveDraft(): Promise<void> {
  if (saving) return;
  saving = true;
  try {
    const state = store.getState();
    if (!state.workshop.on) return;
    const text = await draftText();
    if (!text) {
      toast("The draft is empty.");
      return;
    }
    const target = state.workshop.target;
    switch (target.kind) {
      case "vignette":
        // Drafted from an offer, it is named after the offer.
        store.dispatch(
          vignetteAdded({
            id: api.v1.uuid(),
            title: state.runtime.offers.vignette.picked || firstLine(text),
            text,
          }),
        );
        break;
      case "startingPoint":
        store.dispatch(startingPointSet(splitStartingPoint(text)));
        break;
      case "doc":
        if (!findDoc(state, target.docId)) {
          toast("That document no longer exists.");
          return;
        }
        store.dispatch(docTextSet({ id: target.docId, text }));
        break;
      case "opening":
        store.dispatch(openingKeptSet({ kept: true }));
        await keepDraftAsStory();
        toast("The opening is kept. Workshop Sends are off.");
        return;
    }
    await clearDraft();
    if (target.kind === "vignette" || target.kind === "startingPoint") {
      // The next draft starts from a new offer, not this one's direction:
      // the call to action goes back to offering.
      presetDirection("");
      store.dispatch(offerUnpicked({ kind: target.kind }));
    }
    // A kept vignette changes what the range still lacks: offer the next.
    if (target.kind === "vignette") void offer("vignette");
  } finally {
    saving = false;
  }
}

// ── Writing a whole draft ────────────────────────────────────────────────────
// A Draft button presses NovelAI's own Send for the writer (a scripted
// editor.generate() costs the script nothing) until the draft is long enough,
// the model ends the piece itself, or the writer takes over.

/**
 * Characters a draft is written to before the Draft button stops. Scenes run
 * until the model ends the scene; their length is only a cap against a scene
 * that never ends.
 */
export function draftLength(target: Target): number {
  switch (target.kind) {
    case "vignette":
    case "opening":
      return 7000;
    case "startingPoint":
      return 1600;
    case "doc":
      // A document ends itself with `----` (the next lore block); the cap
      // only guards against one that never does. At 3000 a list was cut off.
      return 12000;
  }
}

/** Sends a Draft button makes at most, whatever the length. */
const MAX_SENDS = 16;
/** A Send that adds less than this has ended the piece. */
const MIN_GROWTH = 40;
/** How long to wait for a Send to finish before giving up on it. */
const SEND_TIMEOUT_MS = 120000;
/** A line the model starts when it has finished a scene: a scene break or a heading. */
export const PIECE_END = /(^|\n)\s*(\*\*\*|⁂|---|\[ |#)/;
/**
 * A line the model starts when it has finished a document: the next block's
 * divider. Headings and lists are part of a document, so only dividers count.
 * A Send continuing a finished paragraph can open with the divider itself, so
 * the start of the text counts as a line start.
 */
export const DOC_END = /(^|\n)\s*(----|\*\*\*|⁂)/;

/** Where the text the model is writing has ended, or -1: `marker` matched. */
export function pieceEnd(text: string, marker: RegExp): number {
  const found = marker.exec(text);
  return found ? found.index : -1;
}

let run: { stop: boolean; ended: boolean } | null = null;
let onEnd: (() => void) | null = null;

/** Resolves when the current Send ends, or after a timeout; false if it timed out. */
function nextEnd(): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (ok: boolean) => {
      if (settled) return;
      settled = true;
      onEnd = null;
      resolve(ok);
    };
    onEnd = () => settle(true);
    void api.v1.timers.setTimeout(() => settle(false), SEND_TIMEOUT_MS);
  });
}

/** Stop a Draft button's run after the Send under way. */
export function stopWriting(): void {
  if (run) run.stop = true;
}

/**
 * Turn Workshop Sends on, point them at a target, and write the whole draft.
 * Resolves true when the draft was written to its end, false when it was
 * refused, the writer took over, or sending failed.
 * A `direction` replaces what is in the box; without one the box is kept.
 * With `replace`, a draft of the same target is cleared first (drafting from
 * an offer means "write this instead"); otherwise the run continues it.
 */
export async function writeDraft(
  target: Target,
  direction?: string,
  replace = false,
): Promise<boolean> {
  if (run) return false;
  await turnOn();
  if (!(await chooseTarget(target))) return false;
  if (replace) await clearDraft();
  if (direction !== undefined) presetDirection(direction);
  run = { stop: false, ended: false };
  store.dispatch(autoDraftSet({ on: true }));
  try {
    const goal = draftLength(target);
    let why = "send limit";
    for (let send = 0; send < MAX_SENDS; send++) {
      const before = (await draftText()).length;
      if (run.stop) why = "writer took over";
      else if (run.ended) why = "scene ended";
      else if (before >= goal) why = "length cap";
      if (run.stop || run.ended || before >= goal) break;
      const ended = nextEnd();
      // Not awaited: a Send NovelAI never starts (the page lost its draft
      // region) left generate() pending and the run stuck; the timeout ends it.
      api.v1.editor.generate().catch((error: unknown) => {
        api.v1.log(`writeDraft: ${String(error)}`);
        if (run) run.stop = true;
      });
      if (!(await ended)) {
        why = "send timed out";
        break;
      }
      const after = (await draftText()).length;
      if (after - before < MIN_GROWTH) {
        why = "send added almost nothing";
        break;
      }
    }
    api.v1.log(`writeDraft stopped: ${why}`);
    // The writer took over: the page is theirs.
    if (run.stop) return false;
    // Cut off (the cap, a stalled Send): end on a whole sentence. A piece the
    // model ended itself is whole, and trimming would cut a last list item
    // that has no full stop.
    if (why !== "scene ended" && why !== "send added almost nothing") {
      await endOnSentence();
    }
    return true;
  } catch (error) {
    toast(
      "Story Engine could not send for you; press Send to continue by hand.",
    );
    api.v1.log(`writeDraft: ${String(error)}`);
    return false;
  } finally {
    run = null;
    store.dispatch(autoDraftSet({ on: false }));
  }
}

/**
 * Put a saved text back on the page to edit or continue it. Turns Workshop
 * Sends on if needed; refused while another draft is unsaved.
 */
export async function openOnPage(target: Target, text: string): Promise<void> {
  await turnOn();
  if (!(await chooseTarget(target))) return;
  if (await draftText()) {
    toast("Save or clear the draft first.");
    return;
  }
  await putOnPage(text);
}

/**
 * May a new draft of `target` take the page? Yes unless an unsaved draft of
 * another target is there: replacing it would lose work the writer did not
 * mean to give up. Toasts when not.
 */
export async function mayReplace(target: Target): Promise<boolean> {
  const { workshop } = store.getState();
  if (!workshop.on || sameTarget(workshop.target, target)) return true;
  if (!(await draftText())) return true;
  toast(
    `Save or clear the ${targetLabel(store.getState(), workshop.target).toLowerCase()} draft first.`,
  );
  return false;
}

/** Put a text on the page in place of the target's draft. */
export async function replaceOnPage(
  target: Target,
  text: string,
): Promise<void> {
  if (!(await mayReplace(target))) return;
  await turnOn();
  if (!(await chooseTarget(target))) return;
  await clearDraft();
  await putOnPage(text);
}

/** The title a notes draft is opened under: "Geography", "Cecile (dossier)". */
function targetTitle(state: RootState, target: Target): string {
  if (target.kind !== "doc") return targetLabel(state, target);
  const doc = findDoc(state, target.docId);
  return doc ? docHeading(doc) : "";
}

// ── Hooks ────────────────────────────────────────────────────────────────────

export function registerWorkshopHooks(): void {
  api.v1.hooks.register("onContextBuilt", async (params) => {
    const { workshop } = store.getState();
    if (!workshop.on) return;
    const target = workshop.target;
    const messages =
      target.kind === "opening"
        ? directOnly(params.messages, directionFor(target))
        : replaceContext(
            params.messages,
            buildFrame(store.getState(), target),
            directionFor(target),
            await draftText(),
            opener(target, targetTitle(store.getState(), target)),
          );
    return { messages, stopFurtherScripts: true };
  });

  api.v1.hooks.register("onGenerationRequested", async (params) => {
    // The writer pressed Send or Retry themselves: they have taken over.
    if (run && !params.scriptInitiated) run.stop = true;
    const { workshop } = store.getState();
    const position = params.generationPosition;
    if (!workshop.on || workshop.boundary === null || !position) return;
    const ids = await api.v1.document.sectionIds();
    if (inDraft(ids, workshop.boundary, position.sectionId)) return;
    toast(
      "That Send would write into the story above the draft, so it was stopped.",
    );
    return { stopGeneration: true };
  });

  // A document ends at the next block's divider, on any workshop Send; a scene
  // ends at a scene break or heading while a Draft button runs. The marker is
  // cut from the text, and the Send stopped: the model has started the next
  // piece.
  const streamed = new Map<string, string>();
  api.v1.hooks.register("onResponse", (params) => {
    const { workshop } = store.getState();
    const kind = workshop.target.kind;
    const marker =
      workshop.on && kind === "doc"
        ? DOC_END
        : run && (kind === "vignette" || kind === "opening")
          ? PIECE_END
          : null;
    if (!marker) return;
    const before = streamed.get(params.continuityId) ?? "";
    const chunk = params.text.join("");
    if (params.final) streamed.delete(params.continuityId);
    else streamed.set(params.continuityId, before + chunk);
    const end = pieceEnd(before + chunk, marker);
    if (end === -1) return undefined;
    if (run) run.ended = true;
    streamed.delete(params.continuityId);
    return {
      text: [chunk.slice(0, Math.max(0, end - before.length))],
      stopGeneration: true,
    };
  });

  api.v1.hooks.register("onGenerationEnd", () => {
    onEnd?.();
    if (store.getState().workshop.on) void redraw();
  });

  api.v1.hooks.register("onHistoryNavigated", () => {
    if (store.getState().workshop.on) void redraw();
  });
}
