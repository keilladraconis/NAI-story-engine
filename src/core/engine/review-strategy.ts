// Review: the slow read that keeps Threads true, and the floors under it.
//
// Triage reads a paragraph or three after every generation and may only revise
// an entity. Review reads a scene's worth, with the Foundation in view, and is
// the only thing that may admit, update or conclude a Thread — because an arc
// is not visible at paragraph grain, and judged there every unsettled detail
// looks like one.
//
// The split of labour is fixed. CODE supplies what can be computed: which prose
// is unread, which entities it names, which Threads' casts are on stage. The
// MODEL decides what the prose shows between them. CODE then checks every
// decision it can check (`applyFloors`) and drops what fails.
//
// Pure: no `api.v1`, no store. The pass (`engine-loop.ts`) reads the document
// and the lorebook and hands the results in.

import type { MessageFactory } from "nai-gen-x";
import { mentionsName, type Watermark } from "./assess";
import {
  cleanArgument,
  indexBy,
  normalizeName,
  type TriageEntity,
} from "./triage-strategy";
import { atThreadCap } from "./thread-cap";
import type { Aliases } from "./thread-bind";
import type { Thread } from "../store/types";
import { buildModelParams } from "../utils/config";
import { REVIEW_SYSTEM, REVIEW_INSTRUCTION } from "../utils/prompts";

/** The review call's output allowance: a reasoning line per Thread on stage,
 *  the admission chain, and the commands. */
export const REVIEW_MAX_TOKENS = 400;

/** How much prose one review reads, in characters — about thirty paragraphs.
 *  A window, never a clamp: what does not fit is left for the next review. */
export const REVIEW_WINDOW_CHARS = 12000;

/** How many separate paragraphs must name each member of an admitted cast. The
 *  computable form of "sustained, not an aside". */
export const ADMIT_MIN_PARAGRAPHS = 3;

// ─────────────────────────────── the window ───────────────────────────────

export type ReviewWindow = {
  /** The unread paragraphs this review will read, in document order. */
  paragraphs: string[];
  /** Where the review watermark moves to if this review completes: the end of
   *  the last section the window covers. Null when there is nothing past the
   *  watermark at all. */
  reached: Watermark | null;
  /** The unread paragraphs the review still owes — what the trigger and the
   *  HUD count. Past a watermark, every one of them, including those this
   *  window did not reach. With no usable watermark, only the window's own:
   *  the story before it is not owed a read. */
  backlog: number;
};

/** The prose the next review reads, up to `limitChars`, whole paragraphs only.
 *
 *  **Past a watermark the document still holds, oldest first.** Same reading of
 *  a watermark as `assess`: an offset inside its section, so prose appended to
 *  a paragraph already reviewed is picked up. What does not fit stays as
 *  backlog and the trigger keeps reviewing until it does.
 *
 *  **With no usable watermark, the story's latest scene** — the last whole
 *  paragraphs that fit, and nothing before them. That is every story the review
 *  has never read (one written before the review existed, or with the Engine
 *  switched on part-way) and every story whose watermarked section is gone
 *  (undo, retry, a paragraph merge). Reading those from the first page would
 *  spend a review on every pass for the length of the story, and judge today's
 *  Threads by chapter one. So the watermark lands on the document's end and the
 *  backlog is only what the window holds.
 *
 *  **The window never cuts a paragraph and never cuts the middle out.** It
 *  stops at the paragraph that would cross the limit. A single paragraph larger
 *  than the limit is taken whole, because the alternative is a review that can
 *  never get past it. */
export function reviewWindow(
  input: {
    sectionIds: number[];
    watermark: Watermark | null;
    textBySection: Map<number, string>;
  },
  limitChars: number = REVIEW_WINDOW_CHARS,
): ReviewWindow {
  const { sectionIds, watermark, textBySection } = input;
  const at = watermark === null ? -1 : sectionIds.indexOf(watermark.sectionId);

  if (watermark === null || at === -1) {
    const paragraphs: string[] = [];
    let size = 0;
    for (let i = sectionIds.length - 1; i >= 0; i--) {
      const text = (textBySection.get(sectionIds[i]) ?? "").trim();
      if (text.length === 0) continue;
      if (paragraphs.length > 0 && size + text.length > limitChars) break;
      paragraphs.unshift(text);
      size += text.length;
    }
    const last = sectionIds.at(-1);
    return {
      paragraphs,
      reached:
        last === undefined
          ? null
          : { sectionId: last, offset: (textBySection.get(last) ?? "").length },
      backlog: paragraphs.length,
    };
  }

  const full = textBySection.get(watermark.sectionId) ?? "";
  const pieces: { sectionId: number; text: string; end: number }[] = [
    {
      sectionId: watermark.sectionId,
      text: full.slice(watermark.offset).trim(),
      end: full.length,
    },
  ];
  for (const sectionId of sectionIds.slice(at + 1)) {
    const text = textBySection.get(sectionId) ?? "";
    pieces.push({ sectionId, text: text.trim(), end: text.length });
  }

  const backlog = pieces.filter((piece) => piece.text.length > 0).length;

  const paragraphs: string[] = [];
  let reached: Watermark | null = null;
  let size = 0;
  for (const piece of pieces) {
    if (piece.text.length > 0) {
      if (paragraphs.length > 0 && size + piece.text.length > limitChars) break;
      paragraphs.push(piece.text);
      size += piece.text.length;
    }
    // A blank section is covered too, so the watermark does not stall on it.
    reached = { sectionId: piece.sectionId, offset: piece.end };
  }

  return { paragraphs, reached, backlog };
}

// ─────────────────────────────── the manifest ───────────────────────────────

function namedIn(text: string, aliases: readonly string[]): boolean {
  return aliases.some((alias) => mentionsName(text, alias));
}

/** How many of these paragraphs name the entity, by any of its aliases. */
export function paragraphsNaming(
  paragraphs: readonly string[],
  aliases: readonly string[],
): number {
  return paragraphs.filter((paragraph) => namedIn(paragraph, aliases)).length;
}

export type ReviewThread = {
  id: string;
  title: string;
  /** Cast names as KNOWN ENTITIES spells them. */
  cast: string[];
  entityIds: string[];
  state: string;
  /** Shown to the review model, which needs it to notice an arc moving. This
   *  prompt is never the story's context. */
  latent: string;
  /** Whether the cast is on stage in this window — computed, never asked. */
  inProse: boolean;
};

/** Both halves of the contract: rendered into the prompt, and the only thing
 *  `parseReview` resolves a name against. */
export type ReviewManifest = {
  /** `formatFoundationBlock`'s output, or "" when the story has none. What
   *  makes "does this matter to the story" a question the input can answer. */
  foundation: string;
  entities: TriageEntity[];
  threads: ReviewThread[];
};

/** Build the manifest from the World and the window.
 *
 *  A Thread is tagged on the same rule its lorebook entry activates on: both
 *  members of a pair, any two of a larger cast, the one of a single.
 *
 *  Entities are the ones the window names, plus every open Thread's cast. An
 *  entity the window never names cannot pass the admission floor, so listing it
 *  would only lengthen a prompt that is rebuilt every review. */
export function buildReviewManifest(input: {
  foundation: string;
  entities: TriageEntity[];
  threads: Thread[];
  aliases: Aliases;
  paragraphs: string[];
}): ReviewManifest {
  const { foundation, entities, aliases, paragraphs } = input;
  const text = paragraphs.join("\n\n");
  const byId = new Map(entities.map((entity) => [entity.id, entity]));
  const open = input.threads.filter((thread) => thread.status === "open");

  const threads: ReviewThread[] = open.map((thread) => {
    const cast = thread.entityIds.filter((id) => byId.has(id));
    const onStage = cast.filter((id) =>
      namedIn(text, aliases[id] ?? []),
    ).length;
    return {
      id: thread.id,
      title: thread.title,
      cast: cast.map((id) => (byId.get(id) as TriageEntity).name),
      entityIds: thread.entityIds,
      state: thread.state,
      latent: thread.latent,
      inProse: cast.length > 0 && onStage >= Math.min(2, cast.length),
    };
  });

  const inCast = new Set(open.flatMap((thread) => thread.entityIds));
  return {
    foundation,
    entities: entities.filter(
      (entity) =>
        inCast.has(entity.id) || namedIn(text, aliases[entity.id] ?? []),
    ),
    threads,
  };
}

// ──────────────────────────────── the prompt ────────────────────────────────

export function reviewParams(): Promise<GenerationParams> {
  return buildModelParams(
    { max_tokens: REVIEW_MAX_TOKENS, temperature: 0.3 },
    "instruct",
  );
}

function formatEntities(entities: TriageEntity[]): string {
  const lines = entities.map((e) => {
    const summary = e.summary.trim();
    return `- ${e.name} [${e.category}]${summary ? `: ${summary}` : ""}`;
  });
  return `=== KNOWN ENTITIES ===\n${lines.join("\n")}`;
}

function formatThreads(threads: ReviewThread[]): string {
  if (threads.length === 0) return "=== THREADS ===\n(none yet)";
  const lines = threads.map(
    (t) =>
      `- ${t.title}${t.inProse ? " [in this prose]" : ""} | cast: ${t.cast.join(", ")}\n  STATE: ${t.state.trim() || "(blank)"}\n  PRIVATE: ${t.latent.trim() || "none"}`,
  );
  return `=== THREADS ===\n${lines.join("\n")}`;
}

/** Context first, the thing being decided last: what the story is, who is in
 *  it, the Threads as recorded, then the prose, then the ask. */
export function createReviewFactory(
  manifest: ReviewManifest,
  paragraphs: string[],
): MessageFactory {
  return async () => {
    const messages: Message[] = [{ role: "system", content: REVIEW_SYSTEM }];
    if (manifest.foundation.trim()) {
      messages.push({ role: "assistant", content: manifest.foundation });
    }
    messages.push(
      { role: "assistant", content: formatEntities(manifest.entities) },
      { role: "assistant", content: formatThreads(manifest.threads) },
      {
        role: "assistant",
        content: `=== PROSE ===\n${paragraphs.join("\n\n")}`,
      },
      { role: "user", content: REVIEW_INSTRUCTION },
    );
    return { messages, params: await reviewParams() };
  };
}

// ──────────────────────────── reading the answer ────────────────────────────

export type ReviewDecision =
  | { kind: "update"; threadId: string }
  | { kind: "conclude"; threadId: string }
  | { kind: "admit"; title: string; entityIds: string[] };

/** A command is the verb in capitals at the start of a line. A reasoning line
 *  ends in its verdict and starts with a Thread title or "Admission", so it
 *  never matches. */
const COMMAND =
  /^\s*(?:[-*•]\s*|\d+[.)]\s*)?(UPDATE|ADMIT|CONCLUDE)\b[:\s]*(.*)$/;

/** Read the review's response into decisions, resolving every name against the
 *  manifest the model was shown. A line that cannot be resolved is dropped —
 *  never fuzzy-matched. An ADMIT naming even one cast member who is not a known
 *  entity is dropped whole: that member is exactly the non-entity the floor
 *  exists to keep out, and admitting the rest would record a different Thread
 *  than the model described. */
export function parseReview(
  text: string,
  manifest: ReviewManifest,
): ReviewDecision[] {
  const threadIds = indexBy(manifest.threads, (t) => t.title);
  const entityIds = indexBy(manifest.entities, (e) => e.name);

  const decisions: ReviewDecision[] = [];
  for (const line of text.split(/\r\n|\r|\n/)) {
    const match = COMMAND.exec(line);
    if (!match) continue;
    const [, verb, rest] = match;

    if (verb === "ADMIT") {
      const bar = rest.indexOf("|");
      if (bar === -1) continue;
      const title = cleanArgument(rest.slice(0, bar));
      const names = rest
        .slice(bar + 1)
        .split(",")
        .map((name) => cleanArgument(name))
        .filter((name) => name.length > 0);
      const ids = names.map((name) => entityIds.get(normalizeName(name)));
      if (!title || ids.length === 0 || ids.includes(undefined)) continue;
      decisions.push({
        kind: "admit",
        title,
        entityIds: [...new Set(ids as string[])],
      });
      continue;
    }

    const threadId = threadIds.get(normalizeName(cleanArgument(rest)));
    if (!threadId) continue;
    decisions.push({
      kind: verb === "UPDATE" ? "update" : "conclude",
      threadId,
    });
  }
  return decisions;
}

// ───────────────────────────────── the floors ─────────────────────────────────

export type FloorContext = {
  threads: Thread[];
  paragraphs: string[];
  aliases: Aliases;
  threadCap: number;
};

export type FloorResult = {
  accepted: ReviewDecision[];
  /** What was refused and why, for the Engine log — so a writer wondering why
   *  no Thread appeared can find the floor that stopped it. */
  refused: { decision: ReviewDecision; reason: string }[];
};

function sameCast(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id) => b.includes(id));
}

/** What code checks before anything is queued.
 *
 *  1. UPDATE and CONCLUDE must name a Thread that is still open.
 *  2. An ADMIT whose cast is exactly an open Thread's cast is that Thread
 *     again under another title; it becomes an UPDATE of it.
 *  3. One ADMIT per review.
 *  4. Every admitted cast member is named in at least `ADMIT_MIN_PARAGRAPHS`
 *     separate paragraphs of the window.
 *  5. No ADMIT at the thread limit.
 *
 *  One decision per Thread: a CONCLUDE outranks an UPDATE of the same Thread,
 *  since the concluding rewrite carries the Thread's whole ledger anyway. */
export function applyFloors(
  decisions: ReviewDecision[],
  context: FloorContext,
): FloorResult {
  const open = context.threads.filter((thread) => thread.status === "open");
  const refused: FloorResult["refused"] = [];
  const touched = new Map<string, ReviewDecision>();
  const admitted: ReviewDecision[] = [];

  const touch = (decision: ReviewDecision & { threadId: string }): void => {
    const held = touched.get(decision.threadId);
    if (!held || decision.kind === "conclude") {
      touched.set(decision.threadId, decision);
    }
  };

  for (const decision of decisions) {
    if (decision.kind !== "admit") {
      if (open.some((thread) => thread.id === decision.threadId)) {
        touch(decision);
      } else {
        refused.push({ decision, reason: "thread is not open" });
      }
      continue;
    }

    const twin = open.find((thread) =>
      sameCast(thread.entityIds, decision.entityIds),
    );
    if (twin) {
      touch({ kind: "update", threadId: twin.id });
      continue;
    }
    if (admitted.length > 0) {
      refused.push({ decision, reason: "one admission per review" });
      continue;
    }
    const thin = decision.entityIds.find(
      (id) =>
        paragraphsNaming(context.paragraphs, context.aliases[id] ?? []) <
        ADMIT_MIN_PARAGRAPHS,
    );
    if (thin !== undefined) {
      refused.push({
        decision,
        reason: `cast member ${thin} is named in fewer than ${ADMIT_MIN_PARAGRAPHS} paragraphs`,
      });
      continue;
    }
    if (atThreadCap(context.threads, context.threadCap)) {
      refused.push({ decision, reason: "thread limit reached" });
      continue;
    }
    admitted.push(decision);
  }

  return { accepted: [...touched.values(), ...admitted], refused };
}
