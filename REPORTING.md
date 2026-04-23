# Reporting Issues — Story Engine

Thanks for taking the time to file a report. Story Engine is a generative tool with a lot of moving parts (Brainstorm, Foundation, Forge, World, S.E.G.A., Bootstrap, Import Wizard), and the single best thing you can do to help a fix land quickly is to send the story you were working in along with a clear description of what went wrong.

---

## What to include in a report

A good bug report answers four questions:

1. **What were you doing?** Which tab and section, which button you clicked, and which step of the flow you were on. Example: _"Running S.E.G.A. on a world with ~20 entities, after an Import All from an existing story."_
2. **What did you expect to happen?** _"Every entity should get lorebook content and keys."_
3. **What actually happened?** _"Content generation finished but keys stage silently produced empty strings for three Characters."_
4. **Can it be reproduced?** _"Happens every run — reloading the story doesn't clear it."_

Screenshots of the panel state, any error toasts, and the exact guidance you typed into the Forge are all useful.

---

## Your setup

Some bugs only show up on certain subscription tiers, models, or with Xialong Mode on or off. Please include all four of these in every report:

- **NovelAI subscription tier** — Scroll, Tablet, or Opus.
- **Storyteller / story model activated in NovelAI** — whichever model you have selected for story generation (e.g. Erato, Kayra, etc.). This is separate from the model Story Engine uses for its own generation.
- **Xialong Mode** — is it **on** or **off** in Story Engine's script config? When Xialong Mode is on, all Story Engine generation goes through Xialong v1 (Opus-only). When it's off, everything goes through GLM 4.6. Bugs frequently behave differently between the two paths, so this matters.
- **Story Engine version** — visible in `project.yaml` or on the script in NovelAI's script editor.

One sentence is enough: _"Opus tier, Erato selected for the story, Xialong Mode on, Story Engine 0.11.0."_

---

## Send the story file

**Attach or DM your story file to @keilla-draconis.** This is the most important part of a report.

The story file contains your Foundation fields, entities, threads, lorebook bindings, Brainstorm sessions, and the full state of Story Engine as it exists in your session. Without it, most bugs can only be guessed at. With it, the behavior can usually be reproduced on the first try.

- **In NovelAI:** export the story from the story menu (the same mechanism you use to back up or share a story) and attach the `.story` file to your issue, or DM it if it contains material you'd rather not post publicly.
- **Be mindful of content.** The story file includes your document text, lorebook, Memory, and Author's Note. If any of that is sensitive, prefer a DM over a public attachment.

If the issue only shows up after a specific action (e.g. "after running Forge a second time with guidance X"), note that too — attach the story in the state _before_ you trigger the bug if possible, so the reproduction starts from a clean step.

---

## Generation Journal

The Generation Journal is Story Engine's built-in prompt/response recorder. When it's enabled, every call Story Engine makes to the model — Foundation generation, Forge steps, S.E.G.A. content/keys passes, Bootstrap phases, lorebook refines — is captured with its full prompt, parameters, response text, token count, and success flag. For issues where _the model's output looked wrong_ (bad lorebook content, Forge skipping a step, Bootstrap producing off-tone prose, empty keys, garbled S.E.G.A. entries), the Journal is what turns "something is off" into a fixable diagnosis.

### When to use it

Turn the Journal on when:

- You're about to reproduce a generation bug you've already seen once.
- You're running S.E.G.A., Forge, or Bootstrap and suspect the model is misbehaving.
- You're triaging output quality (e.g. Forge rejecting commands, keys coming out empty, Bootstrap ignoring Shape/Intent).
- A maintainer has specifically asked you to attach a Journal digest to a report.

You do **not** need the Journal for UI bugs, persistence bugs, lorebook binding issues, or anything where the symptom isn't in the generated text itself.

### How to enable and use it

1. Open the Story Engine script settings in NovelAI and toggle **Generation Journal** on. (It's off by default.)
2. Reload the script. A new **Generation Journal** panel appears in the sidebar.
3. Reproduce the bug — run the Forge, S.E.G.A., Bootstrap, or whichever action caused the issue.
4. Open the Generation Journal panel. You'll see a count of entries recorded and a row of copy buttons:
   - **Full** — the complete journal as Markdown. Every prompt, every response, every parameter. Use this if you're unsure what's relevant; it's the most thorough snapshot and the safest to send.
   - **SEGA** — a trimmed digest of successful S.E.G.A. calls (list-building, lorebook content, keys, refines). Best for reporting S.E.G.A. output-quality issues.
   - **Bootstrap** — the cold-open passes with Foundation anchors and the instruction message, plus the response per phase. Best for reporting Bootstrap tone/structure issues.
   - **Forge** — per-step raw responses, stripped responses, `<think>`-tag detection, and what the command parser extracted. Best for reporting "the Forge skipped this step" or "it didn't create the entity it said it would."
   - **Clear** — empties the in-memory journal. Use between runs so the next capture isn't polluted by earlier attempts.
5. Click the button that matches your bug, paste the clipboard contents into the issue or DM (or save to a text file and attach it).

### Important: the Journal is not saved with the story file

The Journal lives **only in memory**. It is not persisted to the `.story` file, not synced to NovelAI, and not written to storyStorage. When you reload the script, close the tab, or switch stories, the Journal is gone.

That means: **if you want to include Journal data in a report, you must copy it out (Full / SEGA / Bootstrap / Forge) before leaving the page.** Attaching the story file is not enough on its own — the story file carries no Journal content.

Recommended flow for a Journal-backed report:

1. Enable the Journal.
2. Clear the Journal so it starts clean.
3. Reproduce the bug.
4. Click the appropriate copy button **immediately** and paste the output somewhere safe (text file, scratch note, the draft issue).
5. Then export the story file.
6. Send both to @keilla-draconis.

### Don't leave the Journal on during long sessions

The Journal keeps every prompt message, every response, and all parameters in memory for the lifetime of the session. A single Forge run generates a dozen entries; a full S.E.G.A. pass on a populated world adds one per entity per stage; Bootstrap adds one per Continue click. Over a long session that's tens of thousands of lines of prompt text held in the script's heap.

Story Engine runs inside NovelAI's web worker, which has a fixed memory budget. A Journal left on across a multi-hour session can eat enough of that budget to slow generation, cause stutters, or — in the worst case — trigger out-of-memory errors in the worker. None of this is theoretical; it's a direct consequence of the Journal being pure in-memory with no eviction.

So:

- **Turn the Journal on only when you're actively reproducing an issue.**
- **Copy out what you need, then click Clear** between reproduction attempts to free memory.
- **Turn the Journal off** in the script settings once you're done reporting. Reload the script so the panel goes away and nothing is being recorded.

If you've been writing normally for a while with the Journal on and start seeing slowdowns, clearing it is usually the fix.

---

## Quick checklist

Before hitting send on your report:

- [ ] Described what you were doing, expected, and saw
- [ ] Attached or DMed the `.story` file to @keilla-draconis
- [ ] Listed your setup: subscription tier (Scroll / Tablet / Opus), activated story model, Xialong Mode on/off, Story Engine version
- [ ] If it's a generation-quality issue: enabled the Journal, reproduced, and copied the relevant digest (Full / SEGA / Bootstrap / Forge) into the report
- [ ] Turned the Journal back off if you're not actively capturing more

Thanks for the help — every good report makes the next release better.
