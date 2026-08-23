// Triage: the one generation a pass spends, and how to read its answer.
//
// ~150 output tokens (§3.3) on the instruct model, asking only what needs
// attention. Nothing here writes prose, so `appendXialongStyleMessage` is not
// called at all — a style block would be creative-writing guidance for a model
// this call is not using.
//
// Input side follows the layered-prefix discipline context-builder.ts documents
// (§8): the stable manifest first, the volatile new prose last, the ask after
// both. Consecutive passes on the same branch therefore share a prefix up to the
// point where the prose actually changed.
//
// Output side treats the response as untrusted text, because it is. Two rules
// carry the whole parser:
//
//   1. The verb must be CAPITALS. Lowercase would be friendlier to a sloppy
//      model, and it would also read "Open the door slowly." as an OPEN intent.
//      Triage runs hot, so a missed line gets another pass; wrong work rewrites
//      the writer's lorebook entry. Precision wins.
//   2. A name is resolved against the manifest the model was shown, or the line
//      is dropped. Never fuzzy-matched, never passed through as a raw string.
//      A guess here becomes a lorebook rewrite of the wrong entry.
//
// Everything between those two rules is tolerance for decoration the format did
// not ask for — a bullet, a quote, a trailing "— because ..." — since none of it
// changes which entry the line names.

import type { MessageFactory } from "nai-gen-x";
import type { Assessment } from "./assess";
import type { Intent } from "./loop-machine";
import { dedupe } from "./intents";
import { displacedByNextThread, effectiveCap } from "./thread-cap";
import type { ThreadHorizon, ThreadStatus } from "../store/types";
import { TRIAGE_SYSTEM, TRIAGE_INSTRUCTION } from "../utils/prompts";
import { buildModelParams } from "../utils/config";

/** One line of the manifest: what triage is allowed to name, and enough about it
 *  to judge whether the new prose has made it wrong. */
export type TriageEntity = {
  id: string;
  name: string;
  /** Human label ("Character", "Location") — the manifest is read by a model. */
  category: string;
  summary: string;
};

export type TriageThread = {
  id: string;
  title: string;
  /** The thread's reminder prose — `Thread.text`. */
  text: string;
  /** Scale, which is most of what makes one commitment worth more than
   *  another when the list is full (§4.5). */
  horizon: ThreadHorizon;
  /** Satisfied threads are listed, not filtered out. They hold a slot — the
   *  cap counts every thread — so hiding them would leave the fill triage is
   *  shown disagreeing with the fill the reducer enforces. */
  status: ThreadStatus;
};

/** The manifest is both halves of the contract: it is rendered into the prompt,
 *  and it is the only thing `parseTriage` will resolve a name against. Passing
 *  the same object to both is what makes "a name that does not exist is dropped"
 *  mean "a name we never showed it". */
export type TriageManifest = {
  entities: TriageEntity[];
  threads: TriageThread[];
  /** How many threads the story allows at once — the Engine's `threadCap`
   *  setting, unnormalised, exactly as it was read. `formatThreads` puts it
   *  through `effectiveCap` so the number the model is shown is the one the
   *  reducer will apply. */
  threadCap: number;
};

export type TriageInput = {
  manifest: TriageManifest;
  assessment: Assessment;
};

/** Triage's whole output allowance (§3.3). Also the effect's budget reserve:
 *  the reserve only has to cover actual consumption, and triage is the one
 *  generation a pass spends — drain costs nothing until phase 6 executes. */
export const TRIAGE_MAX_TOKENS = 200;

/** The params for the triage call. Exported because genX takes a params object
 *  at submit time as well as the one the factory resolves later, and the two
 *  must not drift into different models or different ceilings. */
export function triageParams(): Promise<GenerationParams> {
  return buildModelParams(
    { max_tokens: TRIAGE_MAX_TOKENS, temperature: 0.3 },
    "instruct",
  );
}

/** Character budget for the volatile prose block, roughly 3k tokens.
 *
 *  `assess` returns the whole document when the watermark is gone (an undo or a
 *  delete past it), so `newText` is unbounded by design and clamping it is the
 *  prompt builder's job, not the definition of what counts as new. Keep the
 *  TAIL: on a lost watermark the dropped prose is prose an earlier pass already
 *  read, and the newest writing is what triage exists to notice. */
const NEW_PROSE_LIMIT = 12000;

/** Exported for the revise prompt (§5), which must be shown the SAME window of
 *  prose triage read. Two clamps would let a revise act on prose triage never
 *  saw, or miss the sentence that caused the intent. */
export function clampProse(text: string): string {
  if (text.length <= NEW_PROSE_LIMIT) return text;
  const tail = text.slice(-NEW_PROSE_LIMIT);
  // Open on a paragraph, not on half a sentence.
  const paragraph = tail.indexOf("\n\n");
  return (paragraph === -1 ? tail : tail.slice(paragraph + 2)).trim();
}

function formatEntities(entities: TriageEntity[]): string {
  const lines = entities.map((e) => {
    const summary = e.summary.trim();
    return `- ${e.name} [${e.category}]${summary ? `: ${summary}` : ""}`;
  });
  return `=== KNOWN ENTITIES ===\n${lines.join("\n")}`;
}

/** The thread list, its ceiling, and — when the ceiling is reached — the price
 *  of the next `OPEN`.
 *
 *  Three decisions live here.
 *
 *  **The heading counts every thread, not the open ones.** §4.5's cap is over
 *  the whole list and prefers to spend a satisfied one; a heading that counted
 *  only open threads would tell the model it had room the reducer does not
 *  agree it has. Satisfied threads are listed for the same reason, marked, and
 *  **without their reminder prose** — a settled commitment has nothing left to
 *  remind anyone of, but it still holds the slot that makes it the cheapest
 *  thing to spend.
 *
 *  **The manifest names the victim; the model does not nominate one.** The
 *  reducer enforces the cap whatever triage says, so a nomination would be an
 *  answer nothing consumes — and carrying it back would need syntax `OPEN` does
 *  not have, which `parseTriage` would drop in silence when the model got it
 *  wrong. `displacedByNextThread` is the same function the reducer's
 *  `enforceThreadCap` orders by, so the price quoted here is the price paid.
 *
 *  **Nothing is said about what displacement does to the writer's lorebook.**
 *  It leaves the entry behind, unmanaged and still enabled (§4.5, §7); a prompt
 *  that promised otherwise would be promising something phase 6 owns. */
function formatThreads(threads: TriageThread[], threadCap: number): string {
  const cap = effectiveCap(threadCap);
  const lines = threads.map((t) => {
    const satisfied = t.status === "satisfied";
    const tags = satisfied ? `${t.horizon}, satisfied` : t.horizon;
    const text = satisfied ? "" : t.text.trim();
    return `- ${t.title} [${tags}]${text ? `: ${text}` : ""}`;
  });

  const displaced = displacedByNextThread(threads, cap);
  if (displaced.length > 0) {
    lines.push(
      `The list is full. Opening another displaces: ${displaced
        .map((t) => t.title)
        .join(", ")}`,
    );
  }

  return `=== THREADS (${threads.length} of ${cap}) ===\n${lines.join("\n")}`;
}

export function createTriageFactory(input: TriageInput): MessageFactory {
  const { manifest, assessment } = input;

  return async () => {
    const messages: Message[] = [{ role: "system", content: TRIAGE_SYSTEM }];

    // Stable layer: what the World already records. Changes rarely, so it stays
    // ahead of the prose to keep the shared prefix as long as possible.
    if (manifest.entities.length > 0) {
      messages.push({
        role: "assistant",
        content: formatEntities(manifest.entities),
      });
    }
    if (manifest.threads.length > 0) {
      messages.push({
        role: "assistant",
        content: formatThreads(manifest.threads, manifest.threadCap),
      });
    }

    // Volatile layer: the reason this pass exists.
    const newText = clampProse(assessment.newText.trim());
    if (newText) {
      messages.push({
        role: "assistant",
        content: `=== NEW PROSE ===\n${newText}`,
      });
    }

    messages.push({ role: "user", content: TRIAGE_INSTRUCTION });

    return { messages, params: await triageParams() };
  };
}

/** Verb in capitals, then the rest of the line. An optional bullet or number in
 *  front is the one deviation worth absorbing — it is what a model reaches for
 *  when asked for a list, and it changes nothing about what the line names.
 *  `\b` after the verb keeps "REVISED" and "OPENING" from matching. */
const COMMAND = /^\s*(?:[-*•]\s*|\d+[.)]\s*)?(REVISE|OPEN|RETIRE)\b[:\s]*(.*)$/;

/** Wrappers a model reaches for when it quotes a name back. Only ever removed as
 *  a matched pair — `C++ (redacted)` ends in a bracket that is part of the name,
 *  and stripping one end of a pair would silently rename it. */
const WRAPPERS: [string, string][] = [
  ['"', '"'],
  ["'", "'"],
  ["“", "”"],
  ["‘", "’"],
  ["[", "]"],
  ["(", ")"],
];

/** Strip decoration the format never asked for, then drop any explanation the
 *  model appended. `|`, `—` and `–` are all separators the house grammar uses
 *  elsewhere; none of them belongs inside an entity name or a six-word subject,
 *  so cutting at the first one recovers the name instead of losing the line. */
function cleanArgument(raw: string): string {
  let text = raw.split(/[|—–]/)[0].trim();

  let peeled = true;
  while (peeled) {
    peeled = false;
    for (const [open, close] of WRAPPERS) {
      if (text.length > 1 && text.startsWith(open) && text.endsWith(close)) {
        text = text.slice(open.length, -close.length).trim();
        peeled = true;
      }
    }
  }

  return text.replace(/[.,;:]+$/, "").trim();
}

/** Names are user text compared against model text: case and inner spacing are
 *  noise, everything else is signal. Nothing here is a pattern, so a name like
 *  "C++ (redacted)" resolves literally. */
function normalize(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Name → id, for the one lookup triage's answer is allowed to make. */
function indexBy<T extends { id: string }>(
  items: T[],
  label: (item: T) => string,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const item of items) {
    const key = normalize(label(item));
    // First listing wins. Two entries sharing a name is rare and either answer
    // is a guess; a stable one at least stays reproducible across passes.
    if (key && !map.has(key)) map.set(key, item.id);
  }
  return map;
}

/** Read triage's response into intents, resolving every name against the
 *  manifest the model was shown. Lines it cannot resolve are dropped in silence:
 *  the next pass sees the same prose situation and can say it again. */
export function parseTriage(text: string, manifest: TriageManifest): Intent[] {
  const entityIds = indexBy(manifest.entities, (e) => e.name);
  const threadIds = indexBy(manifest.threads, (t) => t.title);

  const intents: Intent[] = [];
  // Split on every line terminator, not just "\n": `.` and `$` in COMMAND both
  // stop at a `\r`, so a CRLF response would leave one on the end of every line
  // and no command would match at all.
  for (const line of text.split(/\r\n|\r|\n/)) {
    const match = COMMAND.exec(line);
    if (!match) continue;

    const [, verb, rest] = match;
    const argument = cleanArgument(rest);
    if (!argument) continue;

    switch (verb) {
      case "REVISE": {
        const entityId = entityIds.get(normalize(argument));
        if (entityId) intents.push({ kind: "revise", entityId });
        break;
      }
      case "OPEN":
        // The only argument with nothing to resolve against — triage is naming
        // a commitment the World does not record yet.
        intents.push({ kind: "open", subject: argument });
        break;
      case "RETIRE": {
        const threadId = threadIds.get(normalize(argument));
        if (threadId) intents.push({ kind: "retire", threadId });
        break;
      }
    }
  }

  // One response naming the same work twice is one piece of work. Reuse the
  // queue's own notion of identity rather than inventing a second one.
  return dedupe([], intents);
}
