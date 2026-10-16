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
