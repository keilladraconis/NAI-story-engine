# Lighthouse, third run, 2026-10-16

Same premise as the pilot and the first rerun, on a fresh story (`857e9c44-…`), Story Engine 0.15.0 imported to the story only. Plan and Build at `2e821a0` (the hidden-text check); the Continue fix below (`ebc6810`) was imported before the third Continue was retried. Intensity Grounded, story model Xialong, Engine off (its default), so no triage or review ran.

Premise sent to Plan: "A lighthouse keeper, Ilse, and her younger brother Tam, who came for the summer. The supply boat has stopped coming. Tam has already sold the family's share of the island to the mainland company and hasn't told her. I want her to find out by herself."

## Plan

One reply, facts only: the family holds the island on a lifelong lease (so the sale is possible but not legal), Tam took the advance for an overdue personal debt from the mainland, the signed agreement is in his jacket pocket, and the company's name is the one on the supply barrels.

## Build (empty send)

- Thinking starts on "The writer said:", separates the writer's statements from the collaborator's, finds no contradiction, and names the sale, its reason and the agreement as hidden from Ilse and her finding out as a thing to come.
- Built: Ilse, Tam, The Lighthouse Island, The Silent Sea (situation), Thread **The Keeper's Lease** (Ilse, Tam).
- Thread state (shown): "Ilse and Tam maintain the lighthouse on their family's lifelong lease, but the supply boat has stopped arriving."
- Private: "Tam has sold his interest in the lease to a mainland company to pay a personal debt and has not told Ilse. The signed agreement is in his jacket pocket…"
- Wish: "Ilse finds out about the sale by herself."
- Nothing was cut by the hidden-text check (no "Left out" pill).
- **Shown but half the motive:** Tam's summary says he is "visiting for the summer with a mainland debt he cannot pay". The debt is not hidden in the prompt's terms, but from it the Situation and the Contract ("the unspoken weight of Tam's debt") took it up, and in the prose Ilse raises the debt as something she knows.

## What the story model was sent

Last Context, after the Continues: no "sold", "sale", "agreement" or "company" anywhere. The Thread's entry is in it (cast on the page). The location and situation entries were not (they have no keys the prose matched).

## Opening and Continue the scene

- Opening ("An ordinary morning at the lighthouse, three weeks after the last supply boat."): Ilse alone, past tense, someone climbing the stairs.
- Continue 1: Tam arrives, hands in his jacket pockets; the cistern, four cans of beans.
- Continue 2: Tam produces a folded paper he says is the receipt for the beans ("I paid for these"). Cut off mid-sentence ("…her boots").
- **Continue 3 (before the fix):** opened with "[ Style: advanced, sensory (sight, smell) ]" stitched onto the cut line, then wrote Continue 2 again from "He held it out." to its end. Fixed in `ebc6810` (trim a cut passage to its last full sentence, drop a leading tag, drop leading paragraphs already on the page); the broken passage and the fragment were undone.
- Continue 3 (after the fix): no repeat, no tag, ends on a whole sentence. Ilse: "That debt you have." Our paragraph splitter broke one line of dialogue in two ("…The boat came." / "We ate…").

The `[ Style: … ]` lines were in the story text the Continue saw while the account script Op3na was on, and not after it was switched off, so Op3na's context hook is the likely source of the tag the model copied.

## Seven NovelAI Sends

- The first Sends were word salad. Not Story Engine and not Op3na: the story's preset had Randomness 3 (shown as "(edited) Default", and the Default preset also reads 3). Set to 0.85 for this story; afterwards the prose was sound. (While checking, the Context Viewer looked like it doubled the context; it renders the text in two identical spans, so it does not.)
- Send 1: the ration argument; Tam "I paid for four", "When I am paid, I will take my payment and leave."
- Send 2: Ilse alone, a closing paragraph ("…and waited for the darkness to come.").
- **Send 3: the model began a new document** — "[ Title: The Other Angel; Tags: short stories, third person, gothic; Genre: horror ][ S: 4 ]" and an unrelated house. The pilot's "left the island" failure in another form; it followed a paragraph that read as an ending. Undone.
- Sends 4–7: rain, Tam at the cottage, he opens a can; Ilse catches him; the argument escalates. A continuity slip: four cans, then "the single remaining can".

## Read

- **The secret stayed hidden** everywhere the story model reads, and the Thread is correct and activates. This is the first run where Build's output matched the premise.
- **The motive leaked by way of a summary**: the debt is treated as known to Ilse. Whether a reason for a hidden deed is itself hidden is not something the prompt states.
- **Continue the scene** looped once (fixed); the splitter still splits dialogue.
- **The story model wrote an ending and then started a new story**; nothing in Story Engine stands between a closing paragraph and a new document.
- Op3na's context additions reach Story Engine's own `buildContext` (only Story Engine's hook is suppressed).
