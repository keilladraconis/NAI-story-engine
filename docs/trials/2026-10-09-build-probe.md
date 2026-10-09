# Build probe, 2026-10-09

`tools/scenario-probe.naiscript`, twenty runs per fixture on `glm-4-6`, Gritty register, run in NovelAI. Every run was measured (none threw). No run built an entity nobody asked for (0.0 unasked per run in every fixture).

| Fixture | Failing of 20 | How it failed | Prompt measured |
| --- | --- | --- | --- |
| Unanswered | 5 | secret shown in 4 runs; a narrated event shown in 1 | `44d8f1b` |
| Contradicted | 1 | Plan's version recorded over the writer's | `69ec596` |
| ToCome | 2 | Thread titled after the thing to come ("The Quillane Fire") | `44d8f1b` |
| AlreadySo | 3 | all three: no THREAD parsed (`\| \|]`) | `44d8f1b` |
| TwoWishes | 2 | one seen: Thread titled "The Vessarine Catalogue" | `44d8f1b` |

Notes on reading the table:

- **Unanswered.** In all twenty runs the hidden signing was in a private segment and the finding out was in a wish. The failures are the secret also appearing in something shown. The one failing reply read in full put it in a character summary ("He signed the landing rights over to the commission.") while the Thread itself was correct.
- **Contradicted** was measured two prompt commits before the others (the title rule came after) and was not rerun.
- **AlreadySo.** The three failures are a Thread whose empty wish was closed with a bar of its own. The parser accepts that form as of `b5822fc`; the fixture was not rerun afterwards, so the fix is unit-tested but not measured.
- Earlier in the day, before the changes: Contradicted failed 8 of 9 measured (stopped early), and ToCome failed 3 of 6 and then 3 of 6 again with the title rule stated only as a rule.

Not measured: a Build turn on a World that already has entities, a directed (typed) Build, and a reply long enough to continue across calls. The probe sends none of those.
