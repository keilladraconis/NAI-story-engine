// The Thread write: the prompt that produces a Thread's two halves, how to read
// its answer, and the lint that guards the half the story model sees.
//
// Like `revise-strategy.ts`, this module returns text and never writes. The
// drain's `threadWrite` and `admit` arms dispatch what comes back.
//
// Sent to the INSTRUCT model, for revise's reason one step further: `state` is
// read by the model writing the story, so a creative fine-tune's instinct to
// embellish would put invented specifics into that model's context unattended.

import type { MessageFactory } from "nai-gen-x";
import { clampProse } from "./triage-strategy";
import { trimToLastCompleteUnit } from "./revise-strategy";
import { buildModelParams, isTruncated } from "../utils/config";
import { stripThinkingTags } from "../utils/tag-parser";
import {
  THREAD_WRITE_SYSTEM,
  THREAD_WRITE_INSTRUCTION,
} from "../utils/prompts";

/** The price of one Thread write: three short fields. The drain refuses to
 *  start one the bucket cannot cover and quotes this number, so it must be the
 *  number `max_tokens` then bounds the call at. */
export const THREAD_WRITE_MAX_TOKENS = 300;

export type ThreadWriteInput = {
  title: string;
  /** The cast as the World records it. Summaries are context for who these
   *  entities are; the prompt forbids taking facts about the Thread from them. */
  cast: { name: string; summary: string }[];
  /** The Thread as it stands, or null for an admission. */
  current: { state: string; latent: string } | null;
  /** The prose the review pass read — carried on the intent. */
  prose: string;
};

/** A first answer the lint refused: what the model wrote, and the phrase that
 *  failed. Appended to the same conversation on the retry, so the generation
 *  whose output was rejected is the one that sees the rejection. */
export type ThreadWriteRejection = { reply: string; phrase: string };

export type ThreadRecord = {
  /** What the model said changed. Logged, never stored. */
  moved: string;
  latent: string;
  state: string;
};

/** Colder than revise's 0.6: the fields say what the prose established and no
 *  more, and latitude buys exactly what the prompt spends its length forbidding. */
export function threadWriteParams(): Promise<GenerationParams> {
  return buildModelParams(
    { max_tokens: THREAD_WRITE_MAX_TOKENS, temperature: 0.4, min_p: 0.05 },
    "instruct",
  );
}

function formatCast(cast: ThreadWriteInput["cast"]): string {
  const lines = cast.map((member) => {
    const summary = member.summary.trim();
    return `- ${member.name}${summary ? `: ${summary}` : ""}`;
  });
  return `=== CAST ===\n${lines.join("\n")}`;
}

function formatThread(input: ThreadWriteInput): string {
  const head = `=== THREAD ===\nTitle: ${input.title.trim()}\nCast: ${input.cast
    .map((m) => m.name)
    .join(", ")}`;
  if (!input.current) return `${head}\n(new: no record yet)`;
  return `${head}\nSTATE: ${input.current.state.trim()}\nLATENT: ${
    input.current.latent.trim() || "none"
  }`;
}

/** Context first, the thing being written last: who the cast are, the Thread
 *  as it stands, the prose that moved it, then the ask. */
export function createThreadWriteFactory(
  input: ThreadWriteInput,
  rejection?: ThreadWriteRejection,
): MessageFactory {
  return async () => {
    const messages: Message[] = [
      { role: "system", content: THREAD_WRITE_SYSTEM },
      { role: "assistant", content: formatCast(input.cast) },
      { role: "assistant", content: formatThread(input) },
      {
        role: "assistant",
        content: `=== PROSE ===\n${clampProse(input.prose.trim())}`,
      },
      { role: "user", content: THREAD_WRITE_INSTRUCTION },
    ];
    if (rejection) {
      messages.push(
        { role: "assistant", content: rejection.reply },
        { role: "user", content: stateRejection(rejection.phrase) },
      );
    }
    return { messages, params: await threadWriteParams() };
  };
}

// ──────────────────────────── reading the answer ────────────────────────────

/** A field label at the start of a line: capitals, a colon, and whatever
 *  decoration a model reaches for around them. Capitals are required so a
 *  sentence containing "the state: …" is not read as a field. */
const FIELD =
  /^\s*(?:[-*•]\s*)?\**\s*(MOVED|LATENT|STATE)\s*\**\s*:\s*\**\s*(.*)$/;

/** Read the three fields, or null to decline.
 *
 *  A field runs until the next label, so a model that wraps a sentence loses
 *  nothing. `LATENT: none` reads as empty. A missing or blank STATE declines the
 *  whole write: a Thread's entry text is its state, and a blank one is an entry
 *  with nothing to say. A truncated answer is cut back to its last whole
 *  sentence rather than continued — the drain paid for one call. */
export function parseThreadWrite(
  raw: string,
  finishReason: string | undefined,
): ThreadRecord | null {
  let body = stripThinkingTags(raw);
  if (isTruncated(finishReason)) body = trimToLastCompleteUnit(body);

  const fields: Record<string, string[]> = {};
  let current: string | null = null;
  for (const line of body.split(/\r\n|\r|\n/)) {
    const match = FIELD.exec(line);
    if (match) {
      current = match[1];
      fields[current] = [match[2].trim()];
    } else if (current && line.trim()) {
      fields[current].push(line.trim());
    }
  }

  const read = (label: string): string =>
    (fields[label] ?? []).filter(Boolean).join(" ").trim();

  const state = read("STATE");
  if (!state) return null;
  const latent = read("LATENT");
  return {
    moved: read("MOVED"),
    latent: /^none\.?$/i.test(latent) ? "" : latent,
    state,
  };
}

// ───────────────────────────────── the lint ─────────────────────────────────

/** Phrasing that points at something to come. A lint over surface form, not a
 *  reading of meaning: it will sometimes reject an innocent sentence, and the
 *  cost is one retry. `still` is deliberately absent — "stands still", "the
 *  still water" — and `will` is matched in lowercase only, so a character
 *  named Will does not make every STATE unwritable. */
const FORWARD_PHRASES: readonly { phrase: string; flags: string }[] = [
  { phrase: "yet", flags: "i" },
  { phrase: "hasn't", flags: "i" },
  { phrase: "has not", flags: "i" },
  { phrase: "haven't", flags: "i" },
  { phrase: "have not", flags: "i" },
  { phrase: "soon", flags: "i" },
  { phrase: "will", flags: "" },
  { phrase: "about to", flags: "i" },
  { phrase: "until", flags: "i" },
  { phrase: "must", flags: "i" },
  { phrase: "waiting", flags: "i" },
  { phrase: "sooner or later", flags: "i" },
  { phrase: "one day", flags: "i" },
  { phrase: "eventually", flags: "i" },
];

/** The first forward-pointing phrase in a STATE, or null when it is clean. */
export function lintState(state: string): string | null {
  const text = state.replace(/[\u2018\u2019]/g, "'");
  for (const { phrase, flags } of FORWARD_PHRASES) {
    const pattern = new RegExp(`\\b${phrase.replace(/ /g, "\\s+")}\\b`, flags);
    if (pattern.test(text)) return phrase;
  }
  return null;
}

/** The rejection the retry is shown: the phrase, and the exact repair. */
export function stateRejection(phrase: string): string {
  return `STATE contains "${phrase}", which points forward. Move that to LATENT. STATE says only what is already so. Write all three fields again.`;
}
