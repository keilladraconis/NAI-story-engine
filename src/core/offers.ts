// Offers: GLM pitches the next vignette or a starting point, so the writer
// never has to write a prompt for the story model. Each pitch is the piece
// written as a direction; the writer picks one, adds a note, or steers for
// other ideas. Vignette offers bracket the range against the vignettes
// already kept, where a blank Send only knows the Brief and writes the same
// scene again; starting points come before every vignette's moment.

import { store, offersSet, type Offer, type OfferKind } from "./store";
import { runGlm, Cancelled } from "./engine/glm";
import { OFFER_PROMPT, START_OFFER_PROMPT, START_PROMPT } from "./prompts";
import { openOnPage } from "./workshop/workshop";
import { draftText } from "./workshop/page";
import { formatBrief, interviewDone, parseRound } from "./facilitator";

/** Per kind: the call's job label (its tab shows it while it runs) and prompt. */
export const OFFERING: Record<
  OfferKind,
  { label: string; prompt: string; none: string }
> = {
  vignette: {
    label: "Offering scenes",
    prompt: OFFER_PROMPT,
    none: "No scenes came back; try again.",
  },
  startingPoint: {
    label: "Offering starting points",
    prompt: START_OFFER_PROMPT,
    none: "No starting points came back; try again.",
  },
};

/** Characters of each kept vignette an offer call reads. */
const VIGNETTE_CHARS = 1500;

/** The pitches in a reply, from its first question; none if unreadable. */
export function parseOffers(text: string): { lead: string; offers: Offer[] } {
  const { lead, questions } = parseRound(text);
  return { lead, offers: questions[0]?.options ?? [] };
}

/** The seed and the kept vignettes, as an offer or starting-point call reads them. */
function scenario(): string {
  const state = store.getState();
  const kept = state.canon.vignettes.length
    ? state.canon.vignettes
        .map((v) => `## ${v.title}\n${v.text.trim().slice(0, VIGNETTE_CHARS)}`)
        .join("\n\n")
    : "None yet.";
  return `THE SEED:\n${formatBrief(state.canon.brief)}\n\nVIGNETTES KEPT:\n${kept}`;
}

const offering = new Set<OfferKind>();

/** Ask for new offers of a kind, following the writer's steer if they gave one. */
export async function offer(kind: OfferKind, steer = ""): Promise<void> {
  if (offering.has(kind)) return;
  offering.add(kind);
  try {
    const text = await runGlm({
      id: api.v1.uuid(),
      label: OFFERING[kind].label,
      maxTokens: 900,
      temperature: 0.9,
      messages: async () => {
        const state = store.getState();
        const set = state.runtime.offers[kind];
        // The picked offer was drafted, so it is not passed over.
        const passed = set.offers
          .filter((o) => o.label !== set.picked)
          .map((o) => `- ${o.label}: ${o.description}`)
          .join("\n");
        const user = [
          scenario(),
          passed && `OFFERED LAST TIME, NOT TAKEN:\n${passed}`,
          steer.trim() && `THE WRITER'S STEER:\n${steer.trim()}`,
        ]
          .filter(Boolean)
          .join("\n\n");
        return {
          messages: [
            { role: "system", content: OFFERING[kind].prompt },
            { role: "user", content: user },
          ],
        };
      },
    });
    const parsed = parseOffers(text);
    if (parsed.offers.length) store.dispatch(offersSet({ kind, ...parsed }));
    else void api.v1.ui.toast(OFFERING[kind].none, { type: "info" });
  } catch (error) {
    if (!(error instanceof Cancelled)) {
      void api.v1.ui.toast("Could not make offers.", { type: "error" });
    }
  } finally {
    offering.delete(kind);
  }
}

/** Offer vignettes unprompted once the Brief is complete, unless some wait. */
export function offerIfNone(): void {
  const state = store.getState();
  if (
    state.runtime.offers.vignette.offers.length ||
    !interviewDone(state.canon.brief)
  )
    return;
  void offer("vignette");
}

/** The starting point's job label; the Now tab shows it while it runs. */
export const START_LABEL = "Writing the starting point";

let starting = false;

/**
 * Write the starting point the writer chose as its two ledgers, Now and Not
 * yet, and put it on the page to edit and save. GLM writes it: a story model
 * asked for two lists of notes wrote a scene, and ran past the Not yet.
 */
export async function writeStartingPoint(chosen: string): Promise<void> {
  if (starting || !chosen.trim()) return;
  // Checked before the call, so a draft in the way does not waste it.
  if (store.getState().workshop.on && (await draftText())) {
    void api.v1.ui.toast("Save or clear the draft first.", { type: "info" });
    return;
  }
  starting = true;
  try {
    const text = await runGlm({
      id: api.v1.uuid(),
      label: START_LABEL,
      maxTokens: 700,
      temperature: 0.6,
      messages: async () => ({
        messages: [
          { role: "system", content: START_PROMPT },
          {
            role: "user",
            content: `${scenario()}\n\nWHERE THE WRITER CHOSE TO BEGIN:\n${chosen.trim()}`,
          },
        ],
      }),
    });
    if (text.trim()) await openOnPage({ kind: "startingPoint" }, text.trim());
  } catch (error) {
    if (!(error instanceof Cancelled)) {
      void api.v1.ui.toast("Could not write the starting point.", {
        type: "error",
      });
    }
  } finally {
    starting = false;
  }
}
