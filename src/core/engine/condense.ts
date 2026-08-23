// Condense (§5.1): the counterweight to revision, and the one action that can
// lose information.
//
// Revision only ever adds. Each pass appends what the story has newly made
// true, and nothing in that mechanism removes what has become redundant,
// superseded or merely verbose — so an entry revised twenty times becomes a
// sprawl, and because lorebook entries share the context window with story text
// (§4.3), a bloated World crowds out the recent prose the writer is relying on.
//
// This module owns BOTH halves of §5.1, which is why it is named for the action
// rather than for a strategy the way `revise-strategy.ts` is:
//
//   * the action's prompt, params and response reader — the same shape as
//     revise, deliberately, because §5.1 says condense obeys every rule
//     revision does;
//   * the trigger's memory — the per-entry mark that stops an entry being
//     condensed on every pass forever.
//
// **It returns text and never writes.** Same reason as `revise-strategy.ts`:
// every Engine write to a lorebook entry goes through `lorebook-write.ts`, so
// the entry arrives here as an argument the door read and the compaction leaves
// here as a string the door writes.
//
// §8's phase-6 correction sends this to the INSTRUCT model, for a stronger
// version of revise's reason. A revise at least writes a sentence about
// something that happened; a condense asserts nothing new at all. It is a
// constrained transformation of a document the writer owns, performed
// unattended, and the creative fine-tune's failure mode — embellishment,
// invented specifics — would here be indistinguishable from the compaction
// itself.

import type { MessageFactory } from "nai-gen-x";
import { lorebookCondensedKey } from "../keys";
import { PARAGRAPH_CHARS } from "./thread-horizon";
import { composeRevision, REVISE_MAX_TOKENS } from "./revise-strategy";
import {
  buildModelParams,
  isTruncated,
  LOREBOOK_CHAIN_STOPS,
} from "../utils/config";
import {
  ENGINE_CONDENSE_SYSTEM,
  ENGINE_CONDENSE_INSTRUCTION,
} from "../utils/prompts";

/** §5.1: "It is also the same price as a revision (up to 1024 output tokens,
 *  §3.3), so it competes for the same scarce slot."
 *
 *  Imported rather than restated, so "the same price" is a fact about the code
 *  and not a coincidence two constants currently share. */
export const CONDENSE_MAX_TOKENS = REVISE_MAX_TOKENS;

export type CondenseInput = {
  /** The entry as the door read it (§5). Never fetched here. */
  entry: LorebookEntry;
  /** The house Name/Type/Setting header, from `buildLorebookPrefillFromEntry` —
   *  the same anchor every other lorebook generation uses. */
  prefill: string;
};

/** Params for the condense call.
 *
 *  Colder than revise's 0.6. A revision has to phrase something the entry does
 *  not yet say, and some sampling latitude is what makes that read as prose; a
 *  condense phrases nothing new — every sentence it writes is a tighter saying
 *  of a sentence it was handed. Latitude there buys paraphrase drift, which is
 *  how a fact turns into an approximation of itself. */
export function condenseParams(): Promise<GenerationParams> {
  return buildModelParams(
    {
      max_tokens: CONDENSE_MAX_TOKENS,
      temperature: 0.4,
      min_p: 0.05,
      stop: LOREBOOK_CHAIN_STOPS,
    },
    "instruct",
  );
}

/** The prompt: the entry, and the instruction to say the same thing shorter.
 *
 *  **The new prose is not shown, and that is a decision rather than an
 *  omission.** A condense asserts nothing new — §5.1 calls it a compaction of
 *  what the entry already says — so prose in the prompt is an invitation to add
 *  a fact, which is precisely what the system prompt spends its length
 *  forbidding. It also keeps the call cheap on input and stable in the cache:
 *  the only volatile block is the entry itself.
 *
 *  Every message is pinned. `contextPinning` protects a head and a tail and
 *  trims the middle, and here there is no middle — with four messages, head 1
 *  and tail 3 leave nothing trimmable. Right by construction: the entry being
 *  compacted is the whole input, and a rollover that dropped part of it would
 *  produce a "compaction" that silently deletes whatever it could not see. */
export function createCondenseFactory(input: CondenseInput): MessageFactory {
  const { entry, prefill } = input;

  return async () => {
    const messages: Message[] = [
      { role: "system", content: ENGINE_CONDENSE_SYSTEM },
      {
        role: "assistant",
        content: `=== CURRENT ENTRY ===\n${(entry.text ?? "").trim()}`,
      },
      { role: "user", content: ENGINE_CONDENSE_INSTRUCTION },
      { role: "assistant", content: prefill },
    ];

    return {
      messages,
      params: await condenseParams(),
      contextPinning: { head: 1, tail: 3 },
    };
  };
}

// ──────────────────────────── reading the answer ────────────────────────────

/** The shortest a condensation may be, as a fraction of the entry it was shown.
 *
 *  The structural half of the answer to §5.1's named risk. The prompt argues
 *  for retention; this refuses the answer the prompt failed to prevent.
 *
 *  A third, because that is the gap between the two failures. A real compaction
 *  of an entry that has crossed the threshold — one that removes every
 *  repetition, every superseded clause and every accumulated hedge — lands
 *  around half its length; "condense" read as "summarise" produces two or three
 *  sentences, an order of magnitude down. A floor at a third refuses the second
 *  without ever refusing the first, and the cost of a false refusal is one
 *  declined write on an entry that stays exactly as it was. */
export const CONDENSE_MIN_RATIO = 1 / 3;

/** Turn the model's response into the entry text to write, or null to decline.
 *
 *  Everything the revise path does to a response is done here too — same stop
 *  trim, same thinking-tag strip, same erato separator — because a condensed
 *  entry must be indistinguishable in shape from a generated one. What differs
 *  is the acceptance test, in three ways, and each is a way an unattended lossy
 *  action goes wrong quietly:
 *
 *  **A truncated condense is refused, not trimmed.** This is the one deliberate
 *  divergence from `composeRevision`'s contract, and it comes from the same
 *  premise: trim rather than continue. A revision that hit the ceiling still
 *  recorded the fact it was called for and loses only its tail, so the trimmed
 *  result is worth keeping. A condense that hit the ceiling produced MORE text
 *  than the entry it was asked to shorten — it has failed at its only job — and
 *  keeping its trimmed tail would delete the end of the writer's entry under
 *  the name of compacting it.
 *
 *  **A result that is not shorter is refused.** There is nothing to gain by
 *  writing it and a rewrite of the writer's entry to lose.
 *
 *  **A result under `CONDENSE_MIN_RATIO` is refused**, as a summary rather than
 *  a compaction.
 *
 *  All three leave the entry exactly as it stands, which is always a safe
 *  answer here: unlike a revise, a condense that never runs loses nothing the
 *  story established. */
export async function composeCondensation(
  prefill: string,
  raw: string,
  finishReason: string | undefined,
  original: string,
): Promise<string | null> {
  if (isTruncated(finishReason)) return null;

  const text = await composeRevision(prefill, raw, finishReason);
  if (!text) return null;

  if (text.length >= original.length) return null;
  if (text.length < original.length * CONDENSE_MIN_RATIO) return null;

  return text;
}

// ─────────────────────────────────── the mark ───────────────────────────────────

/** How much an entry must have grown since the Engine last tried to condense it
 *  before it is worth trying again: one paragraph, the house unit (§4.3).
 *
 *  Concretely, a revise typically adds a sentence, so this is several revisions
 *  of accumulation — which is exactly the thing being waited for. */
export const CONDENSE_REGROWTH_CHARS = PARAGRAPH_CHARS;

/** Whether an entry already over the threshold is worth offering again.
 *
 *  Pure, and separate from the storage read, because it is the whole of the
 *  policy: the trigger fires on length alone and would otherwise re-offer the
 *  same entry on every pass forever. See `lorebookCondensedKey` for why that
 *  matters more here than it would for any other action. */
export function worthCondensing(length: number, mark: number): boolean {
  return length - mark >= CONDENSE_REGROWTH_CHARS;
}

/** The entry's mark, or 0 for one the Engine has never tried to condense.
 *
 *  Anything that is not a finite number reads as 0 — the same stance the rest
 *  of the Engine takes toward persisted JSON. Erring toward 0 means erring
 *  toward offering the entry, which costs at most one condense; erring the
 *  other way would silently switch the trigger off for that entry. */
export async function readCondenseMark(entryId: string): Promise<number> {
  const value: unknown = await api.v1.storyStorage.get(
    lorebookCondensedKey(entryId),
  );
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** Record how long the entry was at this attempt — after a successful
 *  compaction, or as it stood when one was declined. */
export async function writeCondenseMark(
  entryId: string,
  length: number,
): Promise<void> {
  await api.v1.storyStorage.set(lorebookCondensedKey(entryId), length);
}
