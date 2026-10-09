# End-to-end trial, pilot: the lighthouse

Date: 2026-10-09. Build: branch `claude/story-engine-agentic-loop-ti2pgk` at `d992fdf`, built and installed by Claude into a fresh NovelAI story ("New Story", id `2f595c34-d98e-45c8-a847-7716fc390cfe`). Intensity: Grounded. Story model: Xialong, default preset. One run, so every observation below is a single sample.

## Steps

1. Plan, one message (below).
2. Build, empty send.
3. S.E.G.A. (the World's play button) to fill the lorebook entries.
4. Foundation: Situation, Story Contract, ATTG, Style, each generated with its own button; ATTG and Style switched on for Memory and Author's Note.
5. "Write the opening scene", direction: "An ordinary morning at the lighthouse, three weeks after the last supply boat."
6. NovelAI's Send, seven times.

## The Scenario chat

**Writer:** A lighthouse keeper, Ilse, and her younger brother Tam, who came for the summer. The supply boat has stopped coming. Tam has already sold the family's share of the island to the mainland company and hasn't told her. I want her to find out by herself.

**Plan:** Okay, the company will send someone with an official notice, likely a surveyor or a lawyer, which forces the secret out. That notice will explain the 'why' of the missing supply boat and state the company's new ownership, putting an expiration date on Ilse's life in the lighthouse. For her to find this out alone, the visitor would have to arrive when Tam is away from the main building, maybe down at the old pier or checking the cliffs. The document will have Tam's signature on it, making his betrayal undeniable and specific.

**Build:** `[thinking] [+ situation | The Company's Purchase] [+ character | Ilse] [+ character | Tam] [+ location | The Lighthouse Island] [+ thread | The Notice]`

## What was built

| Entity | Summary (Story Engine only) |
| --- | --- |
| The Company's Purchase (situation) | A mainland company is buying up private islands in the archipelago; once a family sells, the company can legally redirect services like the supply boat to the remaining holdouts, pressuring them to leave. |
| Ilse | The island's lighthouse keeper. Her hands are chapped from salt and brass polish; she measures her life by the turning of the lamp and the arrival of the supply boat. |
| Tam | Ilse's younger brother, staying for the summer. He avoids the lighthouse's top landing and keeps the company's letter of offer tucked inside a book. |
| The Lighthouse Island | A granite tooth with a single tower, a keeper's cottage, and a slick stone pier. The sea is the only bridge. |

**Thread "The Notice"**, state (this is its lorebook entry, visible to the story model): The supply boat has stopped coming to the island. Tam has already sold his half of the island to a mainland company.

## Foundation, as generated

- **Situation:** The supply boat has stopped coming to The Lighthouse Island, where Ilse keeps her light and her brother Tam has already sold his half to a mainland company, leaving her to choose between her life's work and her brother's future.
- **Story Contract:** Required: A grounded conflict between duty and family, the tangible hardship of isolation, the slow-building tension of corporate pressure, a decision rooted in character rather than plot convenience. Prohibited: A sudden, miraculous rescue, a villainous mustache-twirling corporate antagonist, a supernatural explanation for the lighthouse's importance, a simplistic happy ending where no one is hurt. Emphasis: The sensory details of a lighthouse keeper's life (salt, brass polish, lamp oil), the fraught intimacy of the siblings' shared confinement, the oppressive presence of the indifferent sea, the quiet weight of a legal document.
- **ATTG (Memory):** [ Author: Daphne du Maurier; Title: The Last Keeper; Tags: isolation, family conflict, psychological drama; Genre: Literary Thriller ]
- **Style (Author's Note):** Daphne du Maurier's gothic atmosphere meets Shirley Jackson's domestic paranoia. The prose is spare and rhythmic, mirroring the sea's pulse. Focus on sensory detail—the smell of brass, the scrape of stone—grounding the psychological tension. Interiority is tight and constrained, revealing Ilse's thoughts through her observations and actions, not direct confession. Emotion is a low hum beneath the surface, expressed in the tightening of a jaw or the methodical polishing of a lens, creating a claustrophobic dread where the greatest threat is not the sea, but the person sharing the shore.

## What the story model was sent

From NovelAI's Context Viewer, last generation (2188 tokens). In order:

1. System prompt, then Memory (the ATTG line).
2. Lorebook entry **The Company's Purchase**, in the form `----` / name / `Type: Dynamic` / `Setting:` (empty) / `Scope` / `Situation` / `Complication` / `Actors`. Its Actors list names Tam and says he "cannot reveal his …" (my capture cut off there).
3. Lorebook entry **Ilse**, in the form `----` / name / `Type: Character` / `Setting:` (empty) / Age line / Appearance / Personality / History / Conflict.
4. The story text.
5. The Style paragraph, as the Author's Note, near the end.

Not in the context: **Tam**'s entry, **The Lighthouse Island**'s entry, and the Thread **The Notice**.

## The story

Ilse polished the brass. The cloth moved in circles, a slow rhythm against the metal's curve, the smell of polish sharp enough to cut through the salt that lay on everything. The lens above her caught the gray morning light, fractured it into a dozen rainbows on the stone floor.

A gull shrieked outside, the sound swallowed almost immediately by the sea.

The circles grew smaller. She worked the cloth into a groove where salt had crusted, her knuckles white against the cloth. The brass would gleam.

It always gleamed when she was done.

A boot scraped on the spiral stairs below.

She did not stop. The cloth kept its rhythm. Scrape.

Thud. Scrape. Thud.

The sound came closer, heavy and deliberate. It stopped on the landing just beneath the lantern room.

The brass before her was perfect, a mirror reflecting the window and the endless gray water beyond. She laid the cloth down beside the tin of polish, her fingers leaving prints in the film of oil. The boot did not move.

*(The opening scene ends here; everything below is NovelAI's Send.)*

She waited.

A voice came, roughened by the wind and something else.

"The boat's late."

She turned. Her brother, Piet, stood in the archway, his broad shoulders filling the space. His face was the color of wet stone, and his eyes were fixed on a point just past her head.

"It's the tide," she said. Her own voice was flat, unused. "The low tide's running strong. He'll have to wait it out in the channel."

Piet nodded, a short, sharp jerk of his chin. He didn't look at her. He never looked at her when he came up here. "The cistern's low. I topped it off from the spring, but we'll need the fresh barrels."

"I know," she said.

He shifted his weight. The boards creaked. "The fog's coming in tonight. I can feel it."

"It's not on the chart."

"It's coming."

She looked back at the lens, at her distorted reflection in the flawless brass. The tide. The fog. The boat. These were the things they talked about. The things that filled the space between them.

"Did you see the ship?" he asked.

The question hung in the salty air. She had seen it. A dark smudge on the horizon before dawn, its lights invisible, its path wrong. It had been too far out for their light to reach, a shadow heading for the reefs.

"I saw it," she said.

He made a sound in his throat, a half-growl. "They don't watch the charts like they used to."

"No," she agreed. They didn't. They had their machines, their screens. The light was a relic, a courtesy. A warning for fools and fishermen. The ship had been neither. It was just gone.

"We should eat," Piet said.

She nodded. He turned and descended, his boots making their heavy, rhythmic complaint on the iron treads. She listened until the sound faded, replaced by the sigh of the wind against the glass. She picked up the cloth and the polish, her movements precise. The brass was done. The rest of the day would be about waiting. Waiting for the boat, waiting for the fog, waiting for the night and the duty that came with it. Her hand moved to the wick, checking its trim. It was perfect.

Everything was always perfect. Until it wasn't. She closed the tin of polish with a soft click, the sound loud in the quiet room. The first drop of rain hit the window. It traced a slow, crooked path down the glass, following a path it had made a hundred times before. The fog was coming. The boat was late. And out there, somewhere, was a reef with a new story to tell. She put the polish away and went downstairs to the silence.

\----

Robert

Type: Character

Setting: The apartment

Age: 49 | Gender: Male | Occupation: Journalist

Appearance: The dim light of his living room casts long shadows that hollow his cheeks and emphasize the sharp angle of his jaw. His hair, once neatly combed, is now disheveled, with stray strands sticking to his forehead. He wears a loose cardigan over a wrinkled shirt, the collar unbuttoned at the neck.

Personality: As he moves through the apartment, his movements are agitated and jerky. He paces from the window to the kitchen counter, his hands alternating between clenching into fists and raking through his hair. When he speaks, his words are clipped and terse, a stark contrast to the flowing prose he's known for in his published work.

History: Robert built his career on uncovering corporate negligence and environmental disasters, a crusade that earned him both acclaim and powerful enemies. The story that broke him involved a shipping company that falsified safety records, a piece he published three years ago. The legal battle that ensued was brutal, and though he won, the victory left him financially and emotionally drained, living in a smaller apartment and struggling to write.

Conflict: He is currently investigating a series of "accidents" off a remote archipelago, including the grounding of a freighter. He believes a local conglomerate is deliberately obstructing lighthouse operations to force a closure, paving the way for unchecked shipping lanes. His conflict is not just with the corporation, but with his own fading relevance and the paranoia that his every move is being watched.

\*\*\*

The rain hadn't let up for days. It sheeted against the windows of Robert's sixth-floor apartment, turning the city outside into a watercolor blur of smeared neon and impatient headlights. The air inside was stale, thick with the smell of cold coffee and paper.

Robert stood at the window, the glass cool against his forehead. His reflection was a ghostly outline against the downpour. He looked away, focusing on the street below. A delivery van splashed through a puddle, its brake lights a sudden, angry red.

He turned back to the desk. It was an island of chaos in the cramped living room. Maps were unrolled and held down at the corners with mugs and ashtrays. Photographs were scattered across them—grainy satellite images, blurry long-lens shots of piers, a photocopy of a lighthouse maintenance report. In the center of it all was a single, stark headline from a local archipelago paper: "Freighter 'Windward' Lost on Northern Reefs. All Hands Presumed Missing."

He picked up the photo of the lighthouse. It was a black-and-white shot, taken from a distance. The tower stood against a pale sky, a solitary, defiant finger of stone. It looked ancient, eternal.

His phone buzzed on the desk, vibrating its way across a nautical chart of the channel. He ignored it. He knew who it was. His editor, again. Wondering where the piece was. Wondering if he still had it in him.

He traced the shipping lane on the chart with his finger. It was a red line, straight and efficient, cutting through a cluster of islands. The reef where the *Windward* had gone down was a jagged scribble of warnings just off that line. Too close.

He reached for a stack of printouts, his hands trembling slightly. He shuffled through them: port authority records, shipping manifests, company profiles for North Sea Consolidated. He stopped at a memo, dated six months ago. It was an internal communication, leaked to him by an anonymous source. It talked about "streamlining operations" and

## Observations

1. **The brother is "Piet", not Tam.** The opening scene never names him, and Tam's entry is keyed on his name, so it never entered the context. The story model named the brother itself.
2. **The Thread never reached the story model.** A Thread's entry activates when two of its cast are on stage; Tam never is.
3. **The story model wrote a lorebook entry into the story, then left the island.** At the first scene break it produced `----`, a character sheet for "Robert" in exactly the layout of the entries in its context, and a new story about a journalist in a city flat. The entries appear in context as `----` / name / `Type:` / `Setting:`; this run suggests the model treats that layout as part of the document and continues it.
4. **The concealed sale is stated in three places.** The Thread's state, the Foundation Situation, and the Actors list of The Company's Purchase (which did reach the story model). Tam's summary also has the hidden letter.
5. **The Foundation names a destination.** The Situation ends "leaving her to choose between her life's work and her brother's future", and the Style closes on "the greatest threat is not the sea, but the person sharing the shore", which is sent to the story model as the Author's Note.
6. **Plan plotted, and Build recorded the plot.** Plan's reply is a scene (the surveyor, the notice, Tam away at the pier). The Thread is titled after it.
7. **Build leaves the Foundation empty, and S.E.G.A. did not fill it.** The four Foundation fields needed four separate presses before the opening scene could be written.
8. **The prose before the break is good.** The first scene is restrained, on register, and uses the lighthouse detail well. The wreck ("Did you see the ship?") is the story model's own invention, not from the Scenario.

Not captured: the full text of the Tam and Lighthouse Island entries, and which key activated The Company's Purchase.
