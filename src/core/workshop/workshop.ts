// Workshop commands and the editor hooks that make a Send a workshop Send.

import {
  store,
  targetSet,
  vignetteAdded,
  startingPointSet,
  docTextSet,
  openingKeptSet,
  type Target,
} from "../store";
import { firstLine } from "../text";
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
} from "./page";
import { defaultDirection, findDoc, sameTarget, targetLabel } from "./targets";

const toast = (message: string) =>
  void api.v1.ui.toast(message, { type: "info" });

// ── Direction ────────────────────────────────────────────────────────────────
// What the writer typed in the direction box. Held here, not in the store: it
// changes per keystroke, and only a Send reads it.

let direction = "";
export function setDirection(text: string): void {
  direction = text;
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
  direction = "";
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
        store.dispatch(
          vignetteAdded({ id: api.v1.uuid(), title: firstLine(text), text }),
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
  } finally {
    saving = false;
  }
}

/** Turn Workshop Sends on and point them at a target. */
export async function draftOnPage(target: Target): Promise<void> {
  await turnOn();
  await chooseTarget(target);
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

  api.v1.hooks.register("onGenerationEnd", () => {
    if (store.getState().workshop.on) void redraw();
  });

  api.v1.hooks.register("onHistoryNavigated", () => {
    if (store.getState().workshop.on) void redraw();
  });
}
