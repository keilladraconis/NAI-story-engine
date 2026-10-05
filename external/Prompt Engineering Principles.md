# Prompt Engineering Principles

Sep 27, 2026 · @Wes Brown

These principles are for prompts that must produce the same structured decision on every run: a classifier, an extractor, a lint over prose, a router. They come from two kinds of work. The first was developing prompts against weaker models, whose failures exposed every ambiguity a stronger model would have papered over. The second was a case study: one decision-chain prompt fixed across many drafts, each draft measured at twenty runs per test, so that every edit's effect was counted.

One model of a prompt sits behind every rule here. A prompt is a chain of thought that the model walks in the order it is written, deriving each step from the ones before it. And the model copies what it is shown more faithfully than it follows what it is told: a worked example's reasoning line is carried onto any input that resembles it. Nearly every failure in the case study traced to one of three shapes. A fact was asked for after the verdict that depends on it. A rule was stated as a pattern, and the model fired on the pattern before checking the condition. Or an example line was copied onto an input it did not fit. The parts below are how to avoid those three while writing, and how to find which one a failing prompt has.

The case study comes up throughout, so here is its task. The prompt reads an engineer's cabling notes for one equipment rack and declares the rack's uplinks, the links that leave it. To do that it collects each run a signal travels over (a copper patch, a fibre pair, a trunk through a patch panel), works out where each run's two ends terminate, and declares an uplink wherever an end terminates outside the rack. The fixtures it was tested on describe a rack in a colocation cage and a wiring closet on an office floor. Its two failures were one link declared as two, and a rack's only uplink dropped.

A prompt that produces one creative answer is under lighter rules. The sections on what the model is given to read, sampling, and reading the output still apply to it.

## The words used here

- **Chain, step, arm.** The chain is the prompt's numbered questions in order. A step is one question. An arm is one of its answers and what the model does next.
- **Verdict.** The answer a step, or the whole chain, reaches for one item.
- **Field.** A named slot in the output that one step fills, such as `DESTINATION = core switch`.
- **Worked example.** A sample input walked through the chain inside the prompt, one reasoning line per step.
- **Reasoning line.** One line of a walk, in an example or in the model's output: what the input shows at that step, then the step's answer.
- **Behavioural test.** A test that runs the prompt through the real model on an invented input, the fixture, many times, and asserts the output on every run.
- **Suite and run.** A run is one execution of one test. A suite is every test of the prompt at twenty runs each. Every count in this doc is failing runs of twenty for one test, or failing runs out of the suite's total.
- **Failure family.** One recurring wrong outcome with one mechanism, tracked by its count across drafts.
- **Type boundary.** The line a rule draws between what it includes and what it excludes.

## What to give the model, and what to keep in code

The split is by the kind of rule a question has. A question whose rule can be written as a program over the data it has goes to code. A question whose rule is a reading of language, or an invention the input leaves open, goes to the model. Everything in this doc is about the second kind.

**Code answers what can be looked up or computed.** Each of these has one right answer that a test can assert exactly, and a model asked for it answers from whatever the input happens to show:

- Whether an id names a real port, or a referenced function exists.
- How many items there are, and which are missing.
- The full list of valid choices.
- Whether the output parses.
- The context a prompt is assembled from, in full and in order.
- How many attempts have been made, and what the last one was rejected for.

**The model answers what is read or invented.** Each of these is a judgment over meaning, no program states its rule, and the input's own words decide the case:

- Whether a possessive refers to a character or to an object.
- Where a trunk's far end terminates when the notes describe it from one end.
- What a paragraph of notes is describing, and what it leaves unsaid that a complete inventory needs.
- Which of the valid choices code supplied fits this sentence.

**The seam between them is fixed.** Code supplies the facts, whole and never truncated: every river, every valid port id, every prior attempt's rejection. The model decides among them and writes each decision under its field. Code checks every decision it can check, existence, parse, and count, and rejects a wrong one with the exact repair, and the model retries with that repair in front of it. The model is never asked to count, sort, or confirm membership in a list it was handed, and code never guesses at meaning.

Wrong, the model asked to do code's work:

```
Step 3: List every port id under ## Ports and count them. Check that each id you used in step 2 is in that list, and remove any that is not.
```

Right, the model deciding and code checking:

```
Step 3: For each link, write the id of the port it leaves from, copied from ## Ports.
```

```
port A7 not found; copy an id from ## Ports, do not invent one
```

Wrong, code doing the model's work:

```go
var severityWords = map[string]string{
    "down": "outage", "offline": "outage", "outage": "outage",
    "slow": "degraded", "laggy": "degraded",
}
```

Right, the model reading the text and code recording what it names:

```
Step 5: From the ticket's text, list every condition the customer reports, one per line: CONDITION: <word>
```

**The tells that a job is on the wrong side:**

- A prompt step that asks the model to count, deduplicate, order, or confirm that a thing is in a list it was given. Code does this in one line and is right on every run.
- A table in code mapping words to meanings, or a pattern over prose deciding what the prose says. The next phrasing misses, silently. One such table mapped five words to two severities, and a ticket that said the service was "unreachable" was filed with no outage.
- A parser that repairs, splits, or normalizes what the model produced. The defect is in the prompt, and the repair hides it.
- A rule added to a prompt so the model compensates for something code could enforce or supply. A special case the model has to keep track of is not an answer.

The rest of the doc has three parts: writing the prompt, running it and reading what comes back, and keeping it working once it is in use.

## Writing the prompt

Six rules, in the order a prompt is built: its order, its questions, what it leaves unsaid, how it commits to an answer, its examples, and what it is given to read.

### Prompt order is causal order

The order you ask for things is the order the model derives them. Ask for X before Y and the model derives Y from X, whatever the real dependency. A worldbuilding prompt that asked for nations, then assigned regions to them, then named the regions produced geography that served politics. Reordered to study the terrain, name regions from it, then form nations along natural boundaries, it produced nations that followed the terrain.

Wrong:

```
1. Define the nations.
2. Assign each region to a nation.
3. Name the regions.
```

Right:

```
1. Study each region's terrain.
2. Name each region from its terrain.
3. Form nations along the natural boundaries between regions.
```

**Context first, focus last.** Background material renders first and the thing being decided renders last, where attention is highest.

**Whatever renders after the chain restates nothing.** A closing instruction or a constraints list competes with everything before it. It names the step that decides each thing. A restatement drifts out of date and then contradicts the step it summarizes.

Wrong, a closing constraint restating the field:

```
CONSTRAINTS:
- DESTINATION is the named device the link reaches, or UPSTREAM if none is named.
```

Right, the constraint naming the step that decides it:

```
CONSTRAINTS:
- DESTINATION is the value step 4 wrote.
```

**A fact a step decides from gets its own field, written before that step.** In the case study, a line collecting each link's sentences, written before the step that decides where the link terminates, took the family that declared one link as two from 18 failing runs of 20 to none. A field stating what a run passes through, written before the field that gives its ends, held another family at 1 to 3 failing runs of 20, and the two drafts that folded that field into the ends field returned it to 13 of 20.

Wrong, the verdict asked before the fact it turns on:

```
Step 2: Is one end of the link outside the rack? YES: UPLINK. NO: INTERNAL.
Step 3: Name the link's two ends.
```

Right, the fact written first and the verdict read from it:

```
Step 2: Write the link's two ends. ENDS: <its end in the rack>, <its other end>
Step 3: Is either end in ENDS outside the rack? YES: UPLINK. NO: INTERNAL.
```

The tell is a type boundary that keeps moving. When each edit fixes one failure family and produces another, the fact that decides the boundary is being asked after a verdict that depends on it. Move the fact ahead of the verdict.

### Rules are decision chains, never pattern plus exemption

Order settles where in the chain a fact is decided. How a rule is stated decides whether the model checks its condition at all. A rule of the form "X is a violation UNLESS Y" fails because the model fires on X and never checks Y.

Wrong, a pattern with an exemption:

```
Flag APPOSITIVE: ", her [noun]" UNLESS the possessive refers to an object.
```

Shown `, her silver hair`, this rule flags it and stops. Right, the same rule as a chain, which checks the conditions in order before any verdict is reachable:

1. Does the phrase start with a possessive (her, his, its)? NO: not this pattern. YES: continue.
2. What does the possessive refer to? AN OBJECT: fine. A CHARACTER: flag it.

Each of these defects in a chain's questions has produced a wrong verdict:

- **Every question is answerable from the input, and the case the input cannot decide gets its own arm with the answer stated.** Asked for the likeliest of a closed set with nothing to judge by, the model answers from whatever the input offers, even an option an earlier step excluded.
- **A condition asks for something the input has to show.** "With no device named at its other end" holds vacuously of a pass-through patch panel, which has no other end of its own, and the arm fires on it. Rewrite the condition to ask for what the input has to show.
- **A yes/no chain hides the contrast between options.** The fact that separates the options goes into the first question, or an exclusion in a later branch is never reached.
- **Before placing an exclusion, list every step that reads its line, earlier steps included, and walk the case where the excluded thing is the answer.** An exclusion written into a definition is read by every step that reads the definition, and one of them may be deciding the case the exclusion rules out.
- **State the grain.** Say what a rule holds of (a sentence, a link, a rack) and write each arm at that grain. A rule at the wrong grain breaks on the input that carries two things: "each sentence is collected with one link" stood in for "each link is declared once" and failed on a sentence naming both a trunk and the panel it passes through.
- **A model judging one item reads only what was filed with that item.** A fact about a set, such as the only uplink from a rack, is filed with every item it decides.

Wrong, a question the input cannot answer:

```
Step 6: Which side of the rack does the trunk most likely leave from? SIDE: <front|rear|top|bottom>
```

Right, the case the input cannot decide given its own arm:

```
Step 6: Does any note name the side of the rack this link leaves from? YES: SIDE: <that side>. NO: any side serves. SIDE: rear
```

Wrong, a condition that holds of a thing with no other end:

```
A run with no device named at its other end is an uplink.
```

Right, a condition the input has to show:

```
A run whose other end, away from the rack, has no device named at it is an uplink.
```

**Reasoning lines state what the input shows, then the verdict.** This holds in the chain's own text and in every worked example. A line that opens with its verdict (`Step 2: YES, it plugs into the core switch`) teaches the model to commit and then justify, and the failure it produces is a step answered by the type of the thing with the deciding fact never written. The tell is a worked-example line of the shape `<step>: YES, <reason>`.

Wrong:

```
Step 2: YES, it plugs into the core switch.
```

Right:

```
Step 2: it plugs into the core switch, and the core switch is outside the rack: YES.
```

### Explicit over implicit

A chain still fails on what it leaves unsaid. Rules that "should be obvious" fail. The moment you think "the model should know that", write it out as a step, an arm, or an example. The places implicit knowledge hides:

- **Semantics.** More examples do not help when the model has not understood what the format means. A model read `${2Gender}[male]` as fixed to male when the bracket is a default the user can change. More gender examples did nothing, and one paragraph explaining what the bracket means did.
- **Reference points.** A relative word is read against the text's order unless its reference is named. "Far end", "other end", "beyond", and "back" each assume a point they are measured from. Given none, the model measures from where the sentence starts. The field or step that asks for it names the reference: "its end in the rack, then its other end".
- **Type, not instance.** State the type a rule is about. Instances are examples of it, never a list that defines it by membership. No noun in a rule comes from the input that failed. An edit made from the failing input's own words fits the prompt to that input and leaves the type unfixed for the next one.
- **Scope.** A scope stated only in a section header is ignored when the model works item by item. A worked example shows the scope in use, at the point in the walk where the failures occurred, with an item being passed over.
- **The excluded case.** For every arm, walk an input on which its verdict is wrong, and name the arm that decides that input. An input the chain answers wrongly is a defect in the draft, fixed before the edit lands.

Wrong, more examples of the same mistake:

```
"${2Gender}[male] ... he strode in"    → VIOLATION
"${2Gender}[female] ... she strode in" → VIOLATION
"${2Gender}[male] ... his coat"        → VIOLATION
```

Right, the meaning of the format:

```
PARAMETER BLOCK SEMANTICS
Format: Number + Label[default]: description
The [default] is a starting value the user can change. It is not fixed.
2Gender[male] → the user may change it to "female" → the prose cannot assume male.
```

Wrong, a relative word with no reference:

```
ENDS: the trunk's far end
```

Right:

```
ENDS: its end in the rack, then its other end
```

Two more things reach the model that the author never wrote as instruction: the prompt's history, and its line breaks.

**Describe the thing, never how it got there.** Prompt text says what a thing is, when it fires, and how to use it. It never carries ticket numbers, deprecation history, renames, or author-facing rationale. Every token competes with every other token for attention, and history answers no question the model is asked.

Wrong:

```
:escalate "Ticket was escalated to tier 2 (unified from the retired :bump and :raise per ticket 140). Fires for both agent escalations and automatic SLA escalations."
```

Right:

```
:escalate "Ticket moves to tier 2 (agent action or SLA timeout)"
```

**No newline mid-sentence.** A prompt file is sent as it stands, so every physical newline reaches the model. Hard-wrapping to editor width puts line breaks inside sentences, and the worst place is a worked example's reasoning line. The output rule asks for one line per reasoning line, and a wrapped example shows the model that rule broken, in the line shape it is to copy. It also shows a sentence spanning two lines where every real input has one. Unwrapping one prompt with no word changed made no test worse: its target moved from 4 and 0 failing runs of 20 across two suites to 1 and 1, a difference two suites cannot rank. A newline marks a paragraph break or the end of a block.

Wrong, a worked example's line wrapped to editor width:

```
;; Step 3: the patch's other end is the KVM on shelf 4, a device
;;   in the rack: INTERNAL
```

Right:

```
;; Step 3: the patch's other end is the KVM on shelf 4, a device in the rack: INTERNAL
```

### Make the model commit before it answers

A chain that reasons correctly can still answer wrongly when nothing carries its reasoning into the answer. Two devices close that gap: a plan written before the output, and a named field for every decision.

A plan written before the output raises the fix rate. Early rewrite prompts fixed about 40% of the flagged patterns: the model swapped synonyms and left the pattern in place. Forcing an explicit plan first, each entry naming the flagged text, its category, and the exact replacement text, followed by a separator line and then the rewrite, made the rewrite follow the plan. The separator is a commitment boundary, and each entry carries the replacement text itself.

Wrong, the rewrite alone:

```
[rewritten prose]
```

Right, the plan, the boundary, then the rewrite:

```
FIX PLAN:
1. "her arms wrapped" - APPOSITIVE → Split: "Ilse curled inward. Her arms wrapped..."
2. "not with judgment, but with" - NOTXBUTY → Direct: "with the focused curiosity of..."
---
[rewritten prose]
```

**Every decision the output consumes is written under its field's name at the step that decides it.** A reasoning line that concludes "the link reaches the core switch" fills no field. The output line is assembled from results the chain wrote down (`DESTINATION = core switch`). Three shapes lose a verdict on the way to the output:

- **A verdict left in prose.** Nothing carries it to the answer, so the answer is filled from whatever else is at hand.
- **An input field with the same name as an output field.** A placeholder that appears both in the form the prompt shows and in the form it asks for pulls the input's raw value into the answer. Name inputs for what they are and outputs for the decision that fills them.
- **A second statement of the field.** A constraint that describes an output field in its own words competes with the step that decides it, and constraints render last, where attention is highest. The constraint names the deciding step instead.

Wrong, all three at once: the verdict in prose, the input and output fields both called DEVICE, and no step writing the decision:

```
INPUT:  LINK: <DEVICE> | <DEVICE>       (the second is UPSTREAM when the notes name no far end)
...the trunk runs on through the patch field, so the link reaches the core switch.
OUTPUT: LINK: <DEVICE> | <DEVICE>
```

The model answered `UPSTREAM`, the input's placeholder. Right:

```
INPUT:  LINK: <FROM> | <FAR END>
Step 4: DESTINATION = core switch
OUTPUT: LINK: <FROM> | <DESTINATION>
```

**A field that forces a guess produces one.** The case-study prompt once asked, for each run, which end is in the rack and which is the other end. On a fibre pair, a patch through a panel, and a trunk whose notes placed neither end, every run guessed, and the guess dropped the uplink. Asked instead for the ends as an unordered list and then whether any of them lies outside the rack, the same runs answered correctly.

**An arm for "none given" fires on a thing described from one end.** A trunk that "runs off toward the core switches" has an other end, unnamed, and the runs that took the none-given arm dropped the trunk. The rule states that a run described from one end has an unnamed end away from the rack.

### Worked examples are the prompt

The rules above tell the model what to do. The examples show it, and the model copies a worked example's reasoning line, wording and verdict, onto any input that resembles it. A verdict line written in the same words across examples, or a verdict shown with no contrasting case, is carried onto inputs it does not fit: the example's shape is matched and its verdict follows. One draft wrote every example's step-2 line in one formula, and the failing runs ruled a fibre pair out in that formula's words.

**Minimal pairs are the training signal.** Same surface pattern, different verdict by semantics:

- `, her silver hair coiled` where *her* is the character: a violation.
- `, their heavy scent coating` where *their* is the petals: fine.

Every verdict an example shows has its contrasting case beside it, the input that looks the same and gets the other verdict, and each example's lines state what that example's input shows in words of their own. The tell is an example line whose words would read as true of another input the prompt carries, or a verdict no example contrasts.

Wrong, one formula across the examples, and every verdict the same:

```
Example A, step 2: the notes have no signal enter or leave by it through a device outside rack A: NO
Example B, step 2: the notes have no signal enter or leave by it through a device outside rack B: NO
```

Right, each line in its own words, and the contrasting case beside it:

```
Example A, step 2: the fibre pair carries the rack's traffic up to the core switch, a device outside rack A: YES
Example A, step 2: the patch to the KVM stays on the rack's own switch, and "the fibre pair is the only uplink from the rack": NO
```

**The case an arm decides is taught by the example line that shows the arm applied, at the place in the walk where the model meets it.** Rewording or reordering the arm itself changes no line the model copies. Three measured instances from one prompt:

- Rewording an arm took its target test from 1 and 3 failing runs of 20 across two suites to 3 and 3.
- Giving the same arm one example line took its failure family from 3 failing runs of 40 to none of 80.
- Moving the one example of a section's scope from an example's first sentence to the sentence's own place in the walk, after four others were handled, took the family it targeted from 2 failing runs of 40 to none of 120.

**Write new examples beside every chain fix, and do not economize on length.** Replacing lines the model had copied, one cycle after another, moved nothing. Adding examples that carried each verdict with its contrast did.

**An example that shows a substitution teaches the substitution.** One example wrote a trunk's two ends as the connectors on the trunk itself, where the sentence named the switch at one end and the panel at the other. On a fibre pair whose sentence named the core switch and the panel, the failing runs did the same, and both of the pair's ends fell inside the rack.

### What the model is given to read

The last thing a prompt is built from is what it is given to read. The model does not need the premise to spot a grammatical pattern, and it does need its own prior analysis when it evaluates and its own plan when it rewrites. A multi-step task is one accumulating conversation, never a fresh context per step that pretends the earlier steps happened:

Wrong, a fresh context per step:

```
Analysis:    system + user                                  → analysis
Evaluation:  system + user + "assume the analysis happened"  → evaluation
```

Right, each step appended to the last:

```
Analysis:    system + user                → analysisMessages
Evaluation:  analysisMessages + user      → evalMessages
Rewrite:     evalMessages + user          → final
```

**Never truncate the model's input.** Display limits are not data limits: a human does not want to read forty rivers, and the model needs all forty to reason about drainage. Truncated input is truncated reasoning, and the output still looks coherent. The failure surfaces only when someone counts and finds features missing.

Wrong:

```go
for _, r := range rivers[:10] { ... }   // the model knows ten rivers exist
```

Right:

```go
for _, r := range rivers { ... }        // the model sees every river
```

Text the model produced is under the same rule. Never cap a verdict's reason, a log body, or any generated text to a character count or a single line. A capped reason chops the reasoning both in the record and in whatever reads it back. If output seems to need bounding to avoid flooding a context, fix the source of the bloat, never the length.

**Attention has limits, and the answer is never a cut.** Never truncate does not mean dump everything. Cross-referencing thirty items in one pass fell apart where fifteen held: later items lost coherence with earlier ones and the decisions became arbitrary. When coherence breaks across a large context, do one of three things:

- Reduce the scope of each call, so fewer items are cross-referenced at once.
- Serialize: process items in sequence with accumulated context, instead of all at once.
- Provide compact views of the context items instead of their full text.

Each call carries complete information for its own decision.

## Running it and reading what comes back

A prompt written to every rule above still fails under the wrong sampling or the wrong model, and its output still has to be read by code.

### Sampling and models

Match the sampling to the task, and measure at the sampling you ship with. A deterministic setting on a classifier hides a fragile prompt: every run takes the same path, so a fixed input shows 0 failing runs of 20 or 20, and the rate the twenty-run measure depends on does not exist. A classifier ships with enough temperature for its fragility to show as a rate, and its behavioural tests run at that same setting, since a test at another setting measures a distribution production never samples. This is the sampling twin of never substituting a cheaper model for tests. Deterministic sampling on a judgment call removes the flexibility it needs.

| Task | Sampling | Why |
| --- | --- | --- |
| Classification, extraction | The shipped setting, with enough temperature to show a rate | A greedy path hides a fragile prompt: a fixed input shows 0 or 20 failing runs of 20, never a rate |
| Subjective evaluation | Default | Needs room to weigh |
| Creative generation | Higher temperature | Needs variety |

**Weaker models expose ambiguity.** A weak model needed dozens of iterations where a strong one succeeded at once, and its failures exposed every ambiguity in the rules. The strong model's helpfulness would have papered over the edge cases. The rules the weak model's failures forced transfer to any model.

**A failure is the prompt's, never the model's.** The model is the same on every run. What changed is the input it was given, and a failure attributed to the model leaves the prompt unfixed.

**Never substitute a cheaper model to make testing faster.** A test run against a weaker model than production passes while the real path fails, or fails for reasons production never shows. For a task where model quality is the point, extraction or classification, a weak model invalidates the test. The moment the words "faster" or "cheaper" attach to a model choice, the choice is a cost decision, and it belongs to whoever pays.

**The first answer is never to limit the generator.** Generation is emergent, and a special-case rule the generating model has to keep track of is not an answer. When the model produces something the system cannot represent, ask whether the model is right about the domain. Widen the system when it is, and reject only output that is wrong.

### Reading the output

Model output is format-variable and semantically stable, so a parser matches the semantic marker and tolerates the decoration. Even with the same prompt, runs vary in whitespace, delimiters, markdown emphasis, and list style. A parser that looks for `---\nANALYSIS:\n` breaks on the run that wrote `ANALYSIS` with no rule above it. A parser that looks for a line reading `ANALYSIS` finds every run. Test a parser against several real outputs, never one.

Wrong:

```go
marker := "---\nANALYSIS:\n"
idx := strings.Index(text, marker)
```

Right:

```go
re := regexp.MustCompile(`(?m)^ANALYSIS:?\s*$`)
loc := re.FindStringIndex(text)
```

**Tolerating malformed structured output is a defect.** Format variation is decoration around the right content. A model that was told to output an id and wrote a name in that field, or combined two arguments into one, produced wrong content, and a parser that splits, repairs, or normalizes it absorbs the defect. The silent repair removes the pressure to fix the prompt. Fix the prompt, and add validation that rejects the bad output so the next instance surfaces.

Wrong, the parser absorbing the defect:

```go
name, id := splitNameAndPort(arg)   // "core-sw-1 (A7)" → "core-sw-1", "A7"
```

Right, the rejection that sends it back:

```
argument "core-sw-1 (A7)" is not a port id; write the id alone, copied from ## Ports
```

**Invalid output is rejected and retried with the error as feedback, bounded by an attempt count.** It is never absorbed and never fatal on the first occurrence. The retry only converges if the rejection text is actionable, and four rules make it so:

- The rejection carries the exact repair, and the repair depends on the cause. A validator that can tell several causes apart writes a decision chain over them, each branch its own repair.
- Where the valid choices are not already in the prompt, the rejection carries the full list, computed by the same code that renders the prompt. "Not found" with no choices is unactionable, and an unactionable hint makes the retry loop burn its whole budget on the same mistake. Where the choices are in the prompt, the hint names the section and never repeats it.
- The hint reaches the generation whose output it rejects. When one attempt runs several generations, each one's prompt carries the prior error. A sub-prompt rebuilt fresh every attempt never sees its own rejection and drifts identically until the budget runs out.
- Only model output retries. An infrastructure fault is not something the model can fix by trying again, and it stays fatal.

Wrong, a hint with no repair:

```
port A7 not found
```

Right, the repair, and the roster where the prompt does not already show it:

```
port A7 not found; copy an id from ## Ports, do not invent one
```

Right, one branch per cause the validator can tell apart:

```
symbol rotate-log! is unbound. If it is a value from the job's scope, take it as a parameter. If it is a function defined below this one, move that definition above. If you meant rotate-logs! (params: [path]), name it. Otherwise define it before use.
```

**A validator keyed on what exists separates drift from emergence.** Drift is a mangled or invented form of something that does exist: reject it, and put the attested form in the rejection text. Emergence is something novel, and whether that is a feature or a fault is a design decision, never a default.

**Every consumer that answers "which items are in this set" uses one enumeration.** Two lists that disagree produce an unwinnable contradiction, where one instruction orders the model to add an entry and the gate rejects the result.

**When parsing goes wrong, simplify.** Length checks, section detection, and fallback paths paper over a bug while it stays. Trace where the bad value comes from, understand what the format is, and the fix is usually deletion: a parser that split on the label's colon and checked the label against the known set replaced three layers of guards and found the garbage was a mid-sentence match the old code had never excluded.

Wrong, three guards around the bug:

```go
if len(name) > 50 { continue }                  // reject long names
if !inStep2Section(line) { continue }          // parse only the STEP 2 section
if name == "" { name = rebuildFromIndex() }    // fall back
```

Right, the parser that reads the format:

```go
colonIdx := strings.Index(line, ":")
label := nonLabelChars.ReplaceAllString(line[:colonIdx], "")
name := strings.TrimSpace(strings.Split(line[colonIdx+1:], "—")[0])
if slices.Contains(regionOrder, label) {
    names[label] = name
}
```

## Keeping it working

A prompt in use gets changed, tested, and fixed. Each has a procedure, and each procedure has a tell for when it was skipped.

### Changing a prompt: consider the whole prompt

Every edit to a prompt, and every new prompt, answers this checklist in writing before the edit lands. A discipline held as an intention is dropped mid-edit. Written down, it becomes a step the edit performs and a reviewer can check. Text the engine renders into the prompt, a counter or a follow-up question, is prompt text under the same checklist.

1. **Carrying line.** Quote the line that states the fact now. The edit replaces or extends that line, never adds a sentence beside it, and names what it removes. For a removed clause, name every case it decided in the examples and test fixtures, with the line that decides each case after the edit. A fact the chain has no line for gets a step at its causal position, and every later step is renumbered.
2. **Causal position.** Name the step that decides the fact and every step that reads it, earlier steps included. A question carries no answer. A scope or precondition belongs in the section's own statement of what it runs over, and a verdict belongs in an arm.
3. **Type, not instance.** State the type the fact is about, with instances as its examples and no noun from the fixture or the input that failed.
4. **Grain.** State what the fact holds of, state each arm at that grain, and file a fact about a set with every item it decides.
5. **Vacuous conditions.** For each condition an arm tests, name the input on which it holds without showing the fact it is about. State what keeps the arm from firing there, or rewrite the condition to ask for what the input has to show.
6. **The excluded answer.** For each arm, walk an input on which its verdict is wrong, and name the arm that decides that input. For a walked input no test carries, name the test that would.
7. **Reasoning lines.** Every worked-example line names the step it answers and states what that step read before its answer.
8. **Every dependent.** List every other line, example, right/wrong list, rendered text, and closing instruction that states or reads the same fact, and change them in the same pass.
9. **Derivation bound.** Name what the edit is derived from: a decision that names the change, or the failure it fixes. A failure is a real run in which the prompt produced the wrong outcome, with the chain from the changed line to that outcome and the rule that makes this edit its fix. A change beyond that bound is proposed, not made. Name every behavioural test of the prompt that is red and every one whose fixture the changed step decides, and say of each whether the edit is meant to change its outcome.
10. **After.** Re-read the whole prompt end to end as the model reads it, run every worked example through the changed chain, and confirm nothing contradicts or duplicates the changed fact. The behavioural test is red before the change and is run after it.

**Accretion is the failure this checklist prevents.** Appending a sentence, bullet, exemption, or example beside the line that carries a fact skips items 1 and 8, and so does a same-shape swap judged only at its own line. The recorded shape: one rule written three times, one sentence per live failure, as a pattern, then an exemption, then a counter-exemption, until the model fired on the words before checking the condition. The same rule in one decision chain replaced all three.

Wrong, one rule grown by accretion, one sentence per failure:

```
- A patch panel is never a link.
- A patch panel is never a link, except the panel where the uplink lands.
- A patch panel is never a link, except where the uplink lands; a pass-through panel is one link, not two.
```

Right, one chain that asks the conditions in order:

```
Step 1: Does the rack's traffic leave through this panel? YES: it is the uplink. Continue at step 3. NO: continue.
Step 2: Is the panel a pass-through (a run enters it and a run leaves it)? YES: it is one link, joined to the run that reaches it. NO: it is not a link.
```

### A prompt is tested by its behaviour, never by its text

The checklist above ends at a behavioural test, and so does every fix below. A phrase assertion on a prompt's text verifies nothing about what the model does. It is red until the phrase is typed in and green the moment it is. It stays green for a prompt the model misreads and goes red on a rewording that preserves behaviour, so it pins the wording.

Wrong:

```go
assert.Contains(t, prompt, "a link described in pieces is one link")
```

Right:

```go
for run := 0; run < 20; run++ {
    links := produceUplinks(t, fixture)
    assert.Len(t, links, 1, "a link described in pieces is one link")
}
```

The test that counts seeds a fixture, runs the producer through the real model at the sampling production uses, enough times to show the rate the change claims to fix, and asserts the declared output in the contract's words on every run. One pass is one sample. Its red is a live run that fails for the reason the defect predicts, and its fixture is written before any fix and hardened until every run fails.

**Fixture discipline:**

- A fixture's nouns come from a domain the real inputs never touch, and none of its content is lifted from the input that failed. A fixture that mirrors the failing case tests that case in miniature and writes the input's shape into the suite under an alias.
- A reproduction test is the exception and carries no example: it seeds the failed task's own recorded inputs, extracted once into static files, and asserts the contract. Nothing else borrows from those files.
- Vary the letters across example codes. A sequence within one group shares a letter.

**Assertion discipline:**

- State the contract in one sentence in the domain's words, and write only assertions that sentence entails. An assertion that names a mechanism is specifying an implementation already decided on.
- An assertion of absence is vacuous until the same fixture is shown producing presence.
- Never pin the current broken behaviour as the expected behaviour. A test that asserts what the code does today, with a comment that it is wrong, documents the bug, and the suite stays green over it. Assert the correct behaviour, watch it fail, then fix.
- Never weaken a failing test to make it pass, and never reshape a case's input so an objection cannot recur. The test is right until the contract, in its own words, shows its input wrong.

Wrong, the broken state pinned as the contract:

```go
assert.Nil(t, uplink, "today the uplink is dropped for a rack described from one end")
```

Right, the contract asserted and left red until the fix lands:

```go
require.NotNil(t, uplink, "a rack described from one end keeps its uplink")
```

**Run discipline:**

- Live runs go in the background and are read whole, summary first. A truncated tally is not a result.
- Counts are read as the fixing procedure below states: each denominated, judged by distribution over the tests, target first.

### Fixing a failing prompt

When a behavioural test or a real run fails, the fix follows this order. The tell that the order was skipped is an edit at the line where the wrong verdict appeared, made before the chain was mapped.

1. **Read the recorded reasoning of the run that failed**, in the artifact that failed, exported before anything regenerates it. Name the step that went wrong and the facts of its input that step read. If that input is not the source's own text or a faithful view of it, the defect is in the process that built the input, and the fix goes to that process.
2. **Reproduce the type of those facts on a fixture** in nouns the real inputs do not use, through the real generator, and run it many times, reading the output whole. If not every run fails, the fixture does not carry what the failed run read: compare the passing runs' reasoning at the named step with the failed run's, carry what differs into the fixture in its own nouns, and run again.
3. **Name the failing step from each failing run's reasoning lines.** The outcome does not name the step. One wrong outcome came from a different step each cycle. If the fixture fails at a different step than the real run did, it fails for a different reason, and step 2 is not done. If a fix moved the failure to a new step, continue with that step.
4. **Map the whole chain for causality before drafting:** every fact's deciding step and reading steps, any fact decided after a verdict that depends on it, any exclusion in a later branch than its verdict, and one cause behind several failure families. In the recorded cycle, all six remaining families turned on one question.
5. **Draft the fix as applied text, and audit the draft against the change checklist above, item by item.** Revise until the audit finds nothing.
6. **Apply, stop, and re-read the whole prompt as the model receives it**, closing instruction and constraints included, before any test runs. This re-read found four defects in one draft, one of them a fixture noun.
7. **Run every behavioural test at the repeated count, and measure by distribution.** Set each test's failing runs beside the same test's failing runs on the prompt the draft started from. The draft's target test has to fall: fewer failing runs in at least one suite and more in none. Then the other tests: a rise of one failing run of twenty in a test that had none is within noise. A draft whose target does not fall is worse whatever the other tests do. A draft that makes another test worse beyond noise, and worse again on a second suite, is worse. A worse draft is discarded, and the next draft starts from the prompt it started from.
8. **Run the original failed task on its own recorded inputs**, extracted once into static files, at the same repeated count, asserting the contract in its own words. If every run passes, the fix is done. If not, return to step 1 with this run as the failure.

**How to read the counts.** Twenty runs per test resolve to one run in twenty, so two suites cannot rank families two-of-forty apart, and a family at one-in-twenty shows in none of forty by chance about one time in eight. A family is gone when it shows in no run of eighty or more. A total that does not fall after a family is removed is the next family becoming visible. Every count is denominated: "4 failing runs of 20", never "4".

Wrong, bare numbers under draft headers:

```
            draft 9   draft 11
Pieces      4, 1      1, 1
OneEnd      1, 2      1, 0
```

Right, every count saying what it counts and out of how many:

```
Pieces on draft 9: 4 failing runs of 20, then 1 failing run of 20. On draft 11: 1 and 1 failing runs of 20.
OneEnd on draft 9: 1 failing run of 20, then 2 failing runs of 20. On draft 11: 1 and 0 failing runs of 20.
```

**The failure shapes the cycle corrected:**

- An edit at the step where the wrong verdict appeared moves a type boundary and trades one failure family for the other.
- A fix proposed before the whole chain is read answers the sample and misses the cause.
- A fix checked only against the failing sample breaks on the neighbouring case: the patch panel where the uplink itself lands, or the trunk that is one link described in pieces.
- A violation set aside because no run has failed on it yet is found again, as a failure.
- The system prompt is not the whole prompt. The instruction and constraints render last, and the model reads them there.
- An artifact that did not fail is not evidence that the failure is fixed.
- A draft built on a draft that measured worse keeps the regression and adds its own: three drafts built in turn from one at 16 failing runs of 200, against a base at 7 of 200, measured 18, 19, and 18 of 200.
- One run of the suite read as the prompt's rate, when one prompt gave one test 4, 13, 14, 17, and 18 failing runs of 20 across five suites.
- A draft that adds the missing field at one step and re-shapes the next step's field in the same pass trades the failure at the first step for one at the next. Keep the field that held and leave the next step as it was.
