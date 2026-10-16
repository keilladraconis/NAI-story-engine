# Lighthouse, fourth run, 2026-10-16

Story `800e09b4-…`, Story Engine 0.15.0 from `fc6c12e` (title check, conclusion floor), with the fixes below imported as they landed. Intensity Grounded, Engine **on** (review every 25 paragraphs), story model Xialong on the Default preset (Randomness 0.85), Op3na **off** throughout. Same premise and writer reply as the long run. 233 paragraphs.

## Plan

Plan's two replies were sound, but each ended with a `[NARRATIVE FOUNDATION]` list of the facts so far: GLM copying the header of its own context block. Plan now stops at a bracketed line (`e9727fa`).

## Build: three tries

1. Thread **The Island Deed**. Private notes: the sale, the debt, "Ilse has not been told". But **The Mainland Company**, created as a character, had the summary "A business entity that now legally owns a share of the lighthouse island, though the current inhabitants are unaware." That is the secret in other words, and it shared one word with the private notes, so the overlap check missed it.
   - Fix (`22eccbd`): a summary or Thread state loses any sentence saying someone does not know (`withoutIgnorance`), shown as Left out; step 5 of the Build prompt says the same.
2. Retried on the first form of that check: "He carries a mainland debt he has kept secret." (Tam) and "It is now co-owned by a mainland company, a fact unknown to its keeper." (the island). Both got past the first word list, so it now covers `secret`, `unknown to`, `hidden from`, `conceal` and `behind … back`.
3. Retried on the wider check: Thread **The Island's Deed**. Private: "Tam has sold the family's share of the island to a mainland company to settle a debt he owes, and he has not told Ilse." Wish: "Ilse finds out about the sale on her own." No summary and no state mentions the sale.
   - Tam's summary still says "He carries a debt from his life on the mainland", and the Situation repeats it. That is the motive without the deed. The writer's words do not say whether Ilse knows of the debt, so I let it stand. The story model used it later: the smugglers know about the debt and say so.
   - Titles: three of four lighthouse builds put "Deed" in the title. "Deed" is not in the private notes, so the title check passes it. It reached Tam's lorebook keys (`tam, shutter, knuckles, deed`), but not the prose.
   - The notice of transfer from Plan was dropped, and the wish no longer has a mechanism. Nothing in the prose missed it.

## Foundation and opening

- ATTG `[ Author: Sarah Waters; Title: The Last Keeper; Tags: isolation, duty, family secrets; Genre: Literary Thriller ]`. "Family secrets" says a secret exists without saying what.
- S.E.G.A. entries: Tam's lorebook entry has the debt and creditors, and no sale.
- Opening: good, restrained prose (Tam counting tins). It ran out of tokens just after starting a `## Scene Analysis` of itself, and the heading stayed on the page (undone by hand).
  - Fix (`d7adc27`): both opening calls stop at a line starting `#`, and the parser drops a heading and everything after it.

## Story, paragraphs 17 to 233

On course throughout, with no new document and no character sheet:

- A speedboat lands, the smugglers demand the light and leave cash.
- Ilse and Tam watch a night transfer, then find drugs left as their cut.
- A satellite phone, a changed flash pattern, then rebellion.

The sale itself never comes up. The story found its own plot and Story Engine kept up with it.

## The Engine

- **Private notes**: kept whole across every review. Each review added an honest unknown: "The two men have not explained what their business is", "Ilse has not told Tam what the man said to her". There was no invented discovery and no conclusion.
  - One addition, "Tam has not told Ilse that he sold the island", restates the original in other words. It is harmless, but the notes only grow.
- **Floors**: a second Thread, "The Malfunction Cover", was refused because one cast member was named in fewer than three paragraphs.
- **The Thread fell fifty paragraphs behind.** The state said "Two men are on the island" from paragraph ~66 to ~140, after they had left. The log showed why. The drain deferred every costly intent behind the first one the budget could not cover. Two revises needing 1024 plus the reserve waited on a bucket that steady generation kept below 1324, and the review's 300-token Thread write waited with them.
  - Fix (`253acc4`): rewrites stay in order among themselves, and a Thread write or admission the bucket covers runs. Verified live: both revises deferred at a budget of 1166, and the Thread write ran in the same pass.
- With a Send every ~18 seconds the budget kept falling (1166 to 591), until even the review waited ("review due, budget short"). That is real scarcity, and the design catches up when the writer pauses. A writer reading between Sends is slower than this run.

## Browser notes

- Undo and Retry on a Build reply are confirm buttons: the first click arms them (the icon turns red) and the second fires.
- After a Replace import, reload the page before using the panel.
- The script Logs tab can show a stale list; reopen it to see new lines. `story_engine_debug` is set in the script's Config tab and read at startup.
- The Generation Journal records Story Engine's own S.E.G.A., opening and Build calls, but not the Engine's passes.
