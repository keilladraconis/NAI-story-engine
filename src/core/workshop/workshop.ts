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
  type RootState,
  type Target,
} from "../store";
import { firstLine } from "../text";
import { offerVignettes } from "../offers";
import { buildFrame } from "./frames";
import { replaceContext, directOnly } from "./context";
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
            title: state.runtime.offerPicked || firstLine(text),
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
    if (target.kind === "vignette") {
      // The next vignette starts from a new offer, not this one's direction.
      presetDirection("");
      // A kept vignette changes what the range still lacks: offer the next.
      void offerVignettes();
    }
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
export function draftLength(state: RootState, target: Target): number {
  switch (target.kind) {
    case "vignette":
    case "opening":
      return 7000;
    case "startingPoint":
      return 1600;
    case "doc":
      return findDoc(state, target.docId)?.kind === "dossier" ? 3200 : 3000;
  }
}

/** Sends a Draft button makes at most, whatever the length. */
const MAX_SENDS = 10;
/** A Send that adds less than this has ended the piece. */
const MIN_GROWTH = 40;
/** How long to wait for a Send to finish before giving up on it. */
const SEND_TIMEOUT_MS = 120000;
/** A line the model starts when it has finished the piece: a scene break or a heading. */
export const PIECE_END = /\n\s*(\*\*\*|⁂|---|\[ |#)/;

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
 * A `direction` replaces what is in the box; without one the box is kept.
 */
export async function writeDraft(
  target: Target,
  direction?: string,
): Promise<void> {
  if (run) return;
  await turnOn();
  if (!(await chooseTarget(target))) return;
  if (direction !== undefined) presetDirection(direction);
  run = { stop: false, ended: false };
  store.dispatch(autoDraftSet({ on: true }));
  try {
    const goal = draftLength(store.getState(), target);
    let why = "send limit";
    for (let send = 0; send < MAX_SENDS; send++) {
      const before = (await draftText()).length;
      if (run.stop) why = "writer took over";
      else if (run.ended) why = "scene ended";
      else if (before >= goal) why = "length cap";
      if (run.stop || run.ended || before >= goal) break;
      const ended = nextEnd();
      await api.v1.editor.generate();
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
    // However the run ended (the model, the cap, a stalled Send), it ends on a
    // whole sentence, unless the writer took over: then the page is theirs.
    if (!run.stop) await endOnSentence();
  } catch (error) {
    toast(
      "Story Engine could not send for you; press Send to continue by hand.",
    );
    api.v1.log(`writeDraft: ${String(error)}`);
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

  // While a Draft button runs, a scene break or heading ends the piece: the
  // model has started the next one.
  const streamed = new Map<string, string>();
  api.v1.hooks.register("onResponse", (params) => {
    const kind = store.getState().workshop.target.kind;
    // Documents use headings and rules of their own; only scenes end this way.
    if (!run || (kind !== "vignette" && kind !== "opening")) return;
    const sofar =
      (streamed.get(params.continuityId) ?? "") + params.text.join("");
    if (params.final) {
      streamed.delete(params.continuityId);
      return;
    }
    streamed.set(params.continuityId, sofar);
    if (PIECE_END.test(sofar)) {
      run.ended = true;
      streamed.delete(params.continuityId);
      return { stopGeneration: true };
    }
    return undefined;
  });

  api.v1.hooks.register("onGenerationEnd", () => {
    onEnd?.();
    if (store.getState().workshop.on) void redraw();
  });

  api.v1.hooks.register("onHistoryNavigated", () => {
    if (store.getState().workshop.on) void redraw();
  });
}
