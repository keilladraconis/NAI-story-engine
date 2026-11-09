// Offers: GLM pitches the next vignette, so the writer never has to write a
// prompt for the story model. Each pitch is a scene written as a direction;
// the writer picks one, adds a note, or steers for other ideas. The offers
// bracket the range against the vignettes already kept, where a blank Send
// only knows the Brief and writes the same scene again.

import { store, offersSet, type Offer } from "./store";
import { runGlm, Cancelled } from "./engine/glm";
import { OFFER_PROMPT } from "./prompts";
import { formatBrief, interviewDone, parseRound } from "./facilitator";

/** The offer call's job label; the Vignettes tab shows it while it runs. */
export const OFFER_LABEL = "Offering scenes";

/** Characters of each kept vignette the offer call reads. */
const VIGNETTE_CHARS = 1500;

/** The pitches in a reply, from its first question; none if unreadable. */
export function parseOffers(text: string): { lead: string; offers: Offer[] } {
  const { lead, questions } = parseRound(text);
  return { lead, offers: questions[0]?.options ?? [] };
}

let offering = false;

/** Ask for new offers, following the writer's steer if they gave one. */
export async function offerVignettes(steer = ""): Promise<void> {
  if (offering) return;
  offering = true;
  try {
    const text = await runGlm({
      id: api.v1.uuid(),
      label: OFFER_LABEL,
      maxTokens: 900,
      temperature: 0.9,
      messages: async () => {
        const state = store.getState();
        const kept = state.canon.vignettes.length
          ? state.canon.vignettes
              .map(
                (v) =>
                  `## ${v.title}\n${v.text.trim().slice(0, VIGNETTE_CHARS)}`,
              )
              .join("\n\n")
          : "None yet.";
        // The picked offer was drafted, so it is not passed over.
        const passed = state.runtime.offers
          .filter((o) => o.label !== state.runtime.offerPicked)
          .map((o) => `- ${o.label}: ${o.description}`)
          .join("\n");
        const user = [
          `THE SEED:\n${formatBrief(state.canon.brief)}`,
          `VIGNETTES KEPT:\n${kept}`,
          passed && `OFFERED LAST TIME, NOT TAKEN:\n${passed}`,
          steer.trim() && `THE WRITER'S STEER:\n${steer.trim()}`,
        ]
          .filter(Boolean)
          .join("\n\n");
        return {
          messages: [
            { role: "system", content: OFFER_PROMPT },
            { role: "user", content: user },
          ],
        };
      },
    });
    const parsed = parseOffers(text);
    if (parsed.offers.length) store.dispatch(offersSet(parsed));
    else {
      void api.v1.ui.toast("No scenes came back; try Other ideas again.", {
        type: "info",
      });
    }
  } catch (error) {
    if (!(error instanceof Cancelled)) {
      void api.v1.ui.toast("Could not offer scenes.", { type: "error" });
    }
  } finally {
    offering = false;
  }
}

/** Offer unprompted once the Brief is complete, unless offers are waiting. */
export function offerIfNone(): void {
  const state = store.getState();
  if (state.runtime.offers.length || !interviewDone(state.canon.brief)) return;
  void offerVignettes();
}
