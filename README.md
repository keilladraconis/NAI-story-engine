# Story Engine

**Story Engine** is a NovelAI script that builds a **scenario** with you: the world, the people in it and the pressures between them. Then it gets out of the way, and you steer the story.

It never plots. A story model shown where a story is going writes the arrival; shown the conditions a story grows from, it has room to surprise you. So Story Engine builds conditions: who is here, what they want, what stands between them, and what has not happened yet.

## How it works

Seven tabs in Story Engine's sidebar (under the `…` at the right of NovelAI's sidebar tabs):

1. **Talk** — the **facilitator** interviews you, one question at a time, offering options when you are not sure, until the brief is filled in. Then it says so and points you on.
2. **Brief** — what the scenario is: title, genre, premise, voice, heat, pace, limits, notes. Filled by Talk; edit anything by hand.
3. **Vignettes** — short scenes that set the tone. They say what the scenario must allow, never what will happen.
4. **Now** — where the story begins: what is true at the first page, and what has not happened yet.
5. **Canon** — the world in full prose: geography, history, culture, tensions, factions, systems, a dossier per character, relationships, locations, plot pressures. A **critic** checks each document against the rest.
6. **Cast** — read the cast together and mark it reviewed.
7. **Distill** — compile the canon into Memory, the Author's Note and lorebook entries; then draft the opening.

A tab gets a ✓ when its stage is done. The order is a suggestion; open any tab at any time.

### Drafting on the page

The writing happens in NovelAI's editor, with NovelAI's own Send, on the story model you already use.

Open the **Story Engine** panel under the page and switch **Workshop Sends** on. A divider appears: everything below it is a draft, not part of the story. The sidebar's Draft buttons write a whole draft for you, pressing Send until it is done; or pick what you are drafting, optionally type a direction, and press Send yourself, a piece at a time. Retry until it sounds right, edit it by hand, then press **Save** (it names what it saves: "Save vignette", "Save dossier"). The draft is filed and the page clears for the next one.

This works below a story that is already on the page; the story above the divider is left alone. Switch Workshop Sends off when you are done drafting (save or clear the draft first).

### The canon is the source of truth

The lorebook is compiled from the canon, not the other way round. If you edit a compiled entry, Memory or the Author's Note by hand, Story Engine keeps your edit and never replaces it without asking. To change something that matters, change the canon (the lorebook entry's **Story Engine** tab can do it for you) and distill again.

## Settings

In NovelAI's script settings:

- **Generation Journal** — adds a panel that records every prompt Story Engine sends and its response, with a button to copy them. Useful for reporting a problem with what was generated.
- **Story Engine Debug** — verbose logging.

## Building from source

```
npm ci
npm run build      # → dist/NAI-story-engine.naiscript
npm run test
```

Import `dist/NAI-story-engine.naiscript` in NovelAI under Advanced → Edit User Scripts.

See [WALKTHROUGH.md](WALKTHROUGH.md) for a full walk through a scenario, and [REPORTING.md](REPORTING.md) for reporting problems.
