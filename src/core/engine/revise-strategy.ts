// Revise: the prompt for §5's entry rewrite, and how to read its answer.
//
// **This module returns text to its caller. It never writes.** That is the one
// structural decision behind the file, and it is why the Engine does not reuse
// `buildLorebookContentStrategy`: that path's factory reads the live entry
// itself (`lorebook-strategy.ts`) and its completion handler calls
// `api.v1.lorebook.updateEntry` directly (`effects/handlers/lorebook.ts`). A
// revise built on it would bypass Task 1's door — no §5.2 snapshot, no `lb:`
// record, nothing for §7 to reconcile — for exactly the writes the Engine makes
// unattended. So the entry arrives here as an argument (the door read it) and
// the revision leaves here as a string (the door writes it).
//
// Everything else IS the existing idiom, deliberately: the same anchored
// Name/Type/Setting prefill, the same `LOREBOOK_CHAIN_STOPS`, the same
// `trimStopTail` + `stripThinkingTags` cleanup, the same erato divider. A
// revised entry must be indistinguishable in shape from one the Generate
// Content button produced, or the writer's lorebook grows two dialects.
//
// §8 sends this to the INSTRUCT model. §8's own list files "lorebook content"
// under creative, but that entry was written for the hand-driven button, which
// INVENTS an entry from a summary and is read before it lands. This is a
// constrained transformation of a document the writer already owns, performed
// unattended: the dominant requirement is fidelity to the text it was handed
// and to a rule about what an entry may say, which is §8's own description of
// instruct work. The failure mode of a creative fine-tune — embellishment,
// invented specifics, a narrator's voice — is precisely the failure §5.2 makes
// expensive here, because nobody is watching it happen.

import type { MessageFactory } from "nai-gen-x";
import { clampProse } from "./triage-strategy";
import {
  applyEratoPrefix,
  buildModelParams,
  isTruncated,
  LOREBOOK_CHAIN_STOPS,
  trimStopTail,
} from "../utils/config";
import { stripThinkingTags } from "../utils/tag-parser";
import {
  ENGINE_REVISE_SYSTEM,
  ENGINE_REVISE_INSTRUCTION,
} from "../utils/prompts";

/** §3.3's price for a full lorebook rewrite. The drain's per-intent budget
 *  check already refuses to start one the bucket cannot cover, so this is the
 *  ceiling that check is quoting — the two must not drift. */
export const REVISE_MAX_TOKENS = 1024;

export type ReviseInput = {
  /** The entry as the door read it (§5). Never fetched here: a module that
   *  could read the entry could be called without the door. */
  entry: LorebookEntry;
  /** The house header the entry format opens with, from
   *  `buildLorebookPrefill` — the same anchor every other lorebook generation
   *  uses, and the codebase's standing answer to a model that opens with
   *  "Certainly! Here is the revised entry:". */
  prefill: string;
  /** The prose since the watermark, as the pass assessed it. */
  newText: string;
};

/** Params for the revise call.
 *
 *  Temperature sits between triage's 0.3 and the creative content path's 0.85.
 *  This call writes sentences, so it is not a classifier — but every sentence
 *  it writes is constrained by a document it was handed, and the entry it
 *  produces replaces one the writer owns. */
export function reviseParams(): Promise<GenerationParams> {
  return buildModelParams(
    {
      max_tokens: REVISE_MAX_TOKENS,
      temperature: 0.6,
      min_p: 0.05,
      stop: LOREBOOK_CHAIN_STOPS,
    },
    "instruct",
  );
}

/** The prompt, in the layered order §8's input side asks for.
 *
 *  **The prose comes before the entry**, which inverts the obvious ordering and
 *  is right twice over. Cache: the prose block is identical for every revise in
 *  a pass, so putting it early makes consecutive rewrites share a prefix,
 *  whereas the entry is unique per intent and would break the prefix at message
 *  two. Trimming: `contextPinning` protects a head and a tail and trims the
 *  middle, so whatever sits in the middle is what the rollover may drop — and
 *  the one block this call cannot survive losing is the entry it is rewriting.
 *  Prose in the middle, entry in the pinned tail.
 *
 *  Nothing from Redux is shown. The entity's `summary` is the STATE layer of
 *  CLAUDE.md's DRAFT > LOREBOOK > STATE and the live entry outranks it (§5);
 *  putting a possibly-stale note beside the authoritative text invites the
 *  model to reconcile toward the note. */
export function createReviseFactory(input: ReviseInput): MessageFactory {
  const { entry, prefill, newText } = input;

  return async () => {
    const prose = clampProse(newText.trim());
    const text = (entry.text ?? "").trim();

    const messages: Message[] = [
      { role: "system", content: ENGINE_REVISE_SYSTEM },
      // Volatile-but-shared: the reason this pass exists, identical for every
      // revise it drains, and the only block the rollover may trim.
      { role: "assistant", content: `=== NEW PROSE ===\n${prose}` },
      {
        role: "assistant",
        // An empty entry is LABELLED empty rather than shown as a blank block:
        // a blank block reads as a formatting slip and invites the model to
        // invent the subject from nothing, which is the one thing the rules
        // above forbid.
        content: `=== CURRENT ENTRY ===\n${text || "(this entry is empty)"}`,
      },
      { role: "user", content: ENGINE_REVISE_INSTRUCTION },
      { role: "assistant", content: prefill },
    ];

    return {
      messages,
      params: await reviseParams(),
      contextPinning: { head: 1, tail: 3 },
    };
  };
}

// ──────────────────────────── reading the answer ────────────────────────────

/** Closing punctuation that may follow a full stop and still end a sentence. */
const CLOSERS = `)"'”’]`;

/** Index just past the last complete sentence, or -1.
 *
 *  Scanned backwards rather than with a global match: this only ever runs on a
 *  truncated response and only the last boundary matters. `matchAll` is also
 *  not used anywhere else in this codebase, and QuickJS is the runtime. */
function lastSentenceEnd(text: string): number {
  for (let i = text.length - 1; i >= 0; i--) {
    if (!".!?".includes(text[i])) continue;
    let end = i + 1;
    while (end < text.length && CLOSERS.includes(text[end])) end++;
    if (end === text.length || /\s/.test(text[end])) return end;
  }
  return -1;
}

/** Cut a cut-off response back to the last complete unit it contains.
 *
 *  A sentence boundary and a line boundary are both complete units, and which
 *  one is later depends on what the model was in the middle of — prose, or the
 *  `Age: 34` field lines every entry template opens with. Taking whichever is
 *  further along keeps the most text without ever keeping half of anything.
 *
 *  Exported for `open-strategy.ts`, which answers a truncated reminder the same
 *  way for the same reason. A second implementation of "where does this text
 *  stop being complete" is a second set of edge cases about closing quotes and
 *  abbreviations, and the one that got it wrong would write half a word into
 *  the writer's lorebook. */
export function trimToLastCompleteUnit(text: string): string {
  const cut = Math.max(lastSentenceEnd(text), text.lastIndexOf("\n"));
  return cut <= 0 ? "" : text.slice(0, cut);
}

/** Turn the model's response into the entry text to write, or null to decline.
 *
 *  **A truncated revision is trimmed, never continued.** The existing hand-driven
 *  path answers truncation with up to `LOREBOOK_CONTENT_MAX_CALLS` continuation
 *  calls, and the Engine deliberately does not: the drain checked it could
 *  afford ONE 1024-token rewrite against §3.3's 2048-per-240s bucket, and a
 *  second call spends a budget the writer is also drawing on. So the revision is
 *  cut back to its last complete sentence or line — the 0.14.0 defect ("text no
 *  longer stops mid-sentence") is a mid-WORD entry, and that is what this
 *  prevents.
 *
 *  **Null declines the write**, which the door honours by leaving the entry
 *  exactly as it was. A response with nothing usable in it must never reach
 *  `updateEntry`: the revision REPLACES the entry, so writing an empty or
 *  half-word one deletes the writer's text. Declining costs the pass its
 *  generation and nothing else — triage runs hot (§3.3) and will name the same
 *  entity again. */
export async function composeRevision(
  prefill: string,
  raw: string,
  finishReason: string | undefined,
): Promise<string | null> {
  let body = trimStopTail(stripThinkingTags(raw), LOREBOOK_CHAIN_STOPS);
  if (isTruncated(finishReason)) body = trimToLastCompleteUnit(body);
  body = body.replace(/\s+$/, "");
  if (!body.trim()) return null;

  const erato = Boolean(await api.v1.config.get("erato_compatibility"));
  return applyEratoPrefix(prefill + body, erato);
}
