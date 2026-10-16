# Lighthouse, long run, 2026-10-16

Story `b528e565-…`, Story Engine 0.15.0 at `654185a` (motive rule) with `fd147b2` (other scripts' context hooks suppressed) and `ebc6810` (Continue fix). Intensity Grounded, Engine **on** with default settings (review every 25 paragraphs), story model Xialong. Op3na on for the first ~80 paragraphs, then off.

## Plan and Build

- Premise as before. Plan replied with a scene (a notice of transfer arrives with the final boat, naming Tam as agent of sale). The writer answered: "I like the notice. He sold because he owes money on the mainland, a debt from before the summer." Plan expanded the debt.
- Build: The Last Boat (situation), Ilse, Tam, The Lighthouse Island, Thread **The Deed and the Flour** (Ilse, Tam).
- Shown: Tam is "Ilse's younger brother, staying with her for the summer." No debt anywhere shown — the motive rule held. Situation and Contract (Foundation) mention neither debt nor sale.
- Private: "Tam has sold the family's share of the island to the mainland company to settle a pre-existing debt on the mainland, a debt that ties him to someone who could … The notice of transfer addressed to the new owner, naming Tam as the agent of sale, has been delivered with the last package of flour for Ilse."
- Wish: "Ilse discovers the notice of transfer and learns of the sale on her own."
- The title names the deed ("The Deed …"); the island's summary says "a single family's name on the deed", so it reads as the property deed, but it sits close to the secret.

## Story, with Op3na on

- Opening and Continue sound. Tam lies plausibly ("The company folded. I heard it on the radio"), proposes leaving, warns her off the fuel stores.
- The story model ended a scene and began an unrelated story twice ("⁂" then "Mrs. Henderson"; "***" then a child narrator). Undone as a writer would.
- Register collapse: childish prose, then "***", a new story, and **a character sheet in the prose** — "Thea: / Type: Character, first person / Mood: Hesitant / Setting: …", the layout of Story Engine's own lorebook entries. Second run with such a sheet (the pilot's "Robert").
- Op3na's style tags (`[ Style: childish ]`, `[ Style: diary ]`) were in the context at those points. The childish register began before its tag both times, so the tag followed the drift and then held it. Op3na also writes the story's sampling (Randomness 3–5); on a preset with Min-P off that produced the word salad of the third run.
- What the story model was sent: no sale, debt, notice or agent; the Thread entry active.

## Story, Op3na off

Default preset (Randomness 0.85). Prose recovered: a small boat circles the reef at dusk with a torch; Ilse runs for the boathouse.

## The Engine

By paragraph ~79 the review had updated the Thread:

- State: "Ilse has secured the fuel stores and established a ration plan. Tam has left the cottage for the shore." Fair to the prose.
- **Private notes replaced:** "Ilse knows Tam is planning something and that his concern about the fuel is a feint. Tam does not know that Ilse has seen the notice of sale in the flour package."

Two failures in one write: the sale and the debt are gone from the record, and the Engine asserted the discovery the writer wished for, which the prose never showed. The Thread write (`THREAD_WRITE_SYSTEM`) regenerates both halves from the prose and the old record — "What you leave out is deleted" — and nothing in code protects the private notes. The old note's wording ("delivered with the last package of flour for Ilse") invited the inference.

## After the fix (`91555d3`, the Engine only adds to private notes)

The new build was imported into the same story and, as the writer, the private notes were restored by hand: "Tam has sold the family's share of the island to the mainland company to settle a debt on the mainland from before the summer. The notice of transfer, naming Tam as the agent of sale, came in the last package of flour, and Ilse has not seen it."

Paragraphs 79–118 (Default preset, Op3na off): Tam takes the dinghy and the spare fuel out past the reef, the boat founders, Ilse swims out and drags him back, and gets him into a hot shower. On-story throughout; no new document, no sheet.

The review that followed:

- State: "Ilse is in the cottage with Tam. Tam is in the shower, and Ilse is helping him." Fair.
- Private notes: the restored text kept whole, and appended: "Ilse does not know what Tam was trying to see on the reef, and Tam does not know that Ilse found the notice of sale in the flour."

The secret survived; the invented discovery came back, as an addition, despite the prompt's new rule. The likely seed is the Thread's title, which the story model is shown: "The Deed and the Flour". In the opening the story model wrote the flour sack "heavier than it should" and Ilse digging into it with a knife, which no Build text asked for; the review, knowing the notice came in the flour, read that as finding it. Build's title rule is prompt-only (titles are not checked in code).

Risk if left: a review that believes the secret is known can CONCLUDE the Thread, which folds the private notes into the cast's entity rewrites — shown to the story model.
