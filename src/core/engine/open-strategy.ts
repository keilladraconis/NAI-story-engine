// Open: the prompt for the standing note a Thread injects, and how to read the
// answer.
//
// Like `revise-strategy.ts` and `condense.ts`, this module **returns text and
// never writes** — the caller builds the thread and its entry from what comes
// back (`thread-bind.ts`).
//
// The output is small and the reason is §3.3's, not brevity for its own sake:
// ~150 tokens is what an OPEN is priced at, so the whole action fits beside a
// triage call in one budget window and never competes with the 1024-token entry
// rewrites. It is also the one Engine output that costs the writer context
// every time it fires, which is the stronger argument.
//
// §8 sends this to the INSTRUCT model, like every other Engine call. The
// reasoning is revise's and one step further: this note is read by the model
// writing the story, so a creative fine-tune's instinct to embellish would put
// invented specifics into the story's own context, unattended.

import type { MessageFactory } from "nai-gen-x";
import { clampProse } from "./triage-strategy";
import { trimToLastCompleteUnit } from "./revise-strategy";
import {
  buildModelParams,
  isTruncated,
  LOREBOOK_CHAIN_STOPS,
  trimStopTail,
} from "../utils/config";
import { stripThinkingTags } from "../utils/tag-parser";
import { ENGINE_OPEN_SYSTEM, ENGINE_OPEN_INSTRUCTION } from "../utils/prompts";

/** §3.3's price for opening a thread: a sentence or two of reminder prose. The
 *  drain refuses to start an intent the bucket cannot cover and quotes this
 *  number, so it must be the number `max_tokens` then bounds the call at. */
export const OPEN_MAX_TOKENS = 150;

export type OpenInput = {
  /** The commitment triage named. Free text — the one triage argument with
   *  nothing in the manifest to resolve it against. */
  subject: string;
  /** The prose since the watermark, as the pass assessed it: the only place the
   *  note's facts may come from. */
  newText: string;
};

/** Params for the open call.
 *
 *  Colder than revise's 0.6. The note has to say what the prose established and
 *  no more, and latitude here buys exactly the thing the prompt spends its
 *  length forbidding — a motive, a consequence, or a hint at how this ends,
 *  written into the story model's own context. */
export function openParams(): Promise<GenerationParams> {
  return buildModelParams(
    {
      max_tokens: OPEN_MAX_TOKENS,
      temperature: 0.4,
      min_p: 0.05,
      stop: LOREBOOK_CHAIN_STOPS,
    },
    "instruct",
  );
}

/** The prompt: the prose that raised the commitment, then the commitment.
 *
 *  Prose first for the same two reasons revise orders it that way — it is
 *  identical for every intent in a pass, so consecutive calls share a prefix,
 *  and `contextPinning` trims the middle, which is where the block this call
 *  can best afford to lose belongs. The subject is four words and sits in the
 *  pinned tail beside the instruction.
 *
 *  The prefill is a bare "The ", the smallest anchor that commits the answer to
 *  a sentence rather than to "Certainly! Here is the note:". It is **not** part
 *  of the note — `composeReminder` never sees it and the caller stores only
 *  what the model wrote — because a note is one string shown in three places
 *  (the entry, the World list, the triage manifest) and scaffolding that reads
 *  as content in one of them reads as noise in the other two. */
export function createOpenFactory(input: OpenInput): MessageFactory {
  const { subject, newText } = input;

  return async () => {
    const messages: Message[] = [
      { role: "system", content: ENGINE_OPEN_SYSTEM },
      {
        role: "assistant",
        content: `=== NEW PROSE ===\n${clampProse(newText.trim())}`,
      },
      {
        role: "assistant",
        content: `=== THE COMMITMENT ===\n${subject.trim()}`,
      },
      { role: "user", content: ENGINE_OPEN_INSTRUCTION },
      { role: "assistant", content: "The " },
    ];

    return {
      messages,
      params: await openParams(),
      contextPinning: { head: 1, tail: 3 },
    };
  };
}

// ──────────────────────────── reading the answer ────────────────────────────

/** Turn the model's response into the thread's reminder, or null to decline.
 *
 *  **The first paragraph only.** A model that writes a second one is explaining
 *  itself or writing the scene, and every line of it is context spent each time
 *  the thread fires — the cost §4.3's whole construction exists to keep down.
 *
 *  **A truncated answer is cut back, not continued.** Same contract as
 *  `composeRevision`, through the same function: the drain paid for one 150-
 *  token call, and a continuation spends a budget the writer is also drawing
 *  on. A truncation with no complete sentence in it leaves nothing.
 *
 *  **Null declines the whole intent**, which matters more here than in a
 *  revise: there is no thread and no entry yet, so declining costs the pass its
 *  generation and leaves the World exactly as it was. Writing a blank reminder
 *  instead would put an always-on lorebook entry in the writer's book with
 *  nothing in it to say. */
export function composeReminder(
  raw: string,
  finishReason: string | undefined,
): string | null {
  let body = trimStopTail(stripThinkingTags(raw), LOREBOOK_CHAIN_STOPS).trim();
  if (isTruncated(finishReason)) body = trimToLastCompleteUnit(body).trim();

  const paragraph = body.split(/\n\s*\n/)[0].trim();
  return paragraph.length > 0 ? paragraph : null;
}
