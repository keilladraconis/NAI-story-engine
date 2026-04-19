import { GenerationStrategy } from "../../types";
import {
  GenerationHandlers,
  StreamingContext,
  CompletionContext,
} from "../generation-handlers";
import { stripThinkingTags } from "../../../utils/tag-parser";
import { trimStopTail } from "../../../utils/config";
import { buildBootstrapContinueStrategy } from "../bootstrap-effects";
import { generationSubmitted, requestQueued } from "../../index";

type BootstrapTarget = Extract<GenerationStrategy["target"], { type: "bootstrap" }>;
type BootstrapContinueTarget = Extract<GenerationStrategy["target"], { type: "bootstrapContinue" }>;

const MAX_CONTINUE_ITERATIONS = 5; // iterations 0–4 → 5 continuation paragraphs

// When true, the next Phase 2 iteration should join the last document section inline
// rather than starting a new paragraph. Set when a generation ends mid-sentence
// (max_tokens fired before a natural \n\n boundary). Reset on completion or failure.
let continueInline = false;

function parseParagraphs(text: string): string[] {
  return stripThinkingTags(text)
    .trim()
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && !/^[\*\-#=~\s]+$/.test(p))
    .flatMap(chunkParagraph);
}

// xialong-v1 tends to emit dense wall-of-text prose regardless of prompting.
// Chunk long paragraphs into ~3-sentence groups and split on dialogue boundaries
// so the document has visible paragraphing — which also seeds subsequent
// iterations' context with paragraphing precedent the model will imitate.
function splitIntoSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…]["')\]]?)\s+(?=[A-Z"'(\[—])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function chunkParagraph(paragraph: string): string[] {
  const sentences = splitIntoSentences(paragraph);
  if (sentences.length <= 3) return [paragraph];

  const result: string[] = [];
  let current: string[] = [];
  for (const sentence of sentences) {
    const startsWithQuote = /^["“”]/.test(sentence);
    // Break before a dialogue sentence once we have ≥2 non-dialogue sentences,
    // or at 3 sentences regardless — keeps narrative runs tight and gives
    // dialogue its own paragraph.
    if (current.length >= 2 && (startsWithQuote || current.length >= 3)) {
      result.push(current.join(" "));
      current = [];
    }
    current.push(sentence);
  }
  if (current.length > 0) result.push(current.join(" "));
  return result;
}

/** True when text ended at a natural sentence/scene boundary (not mid-sentence max_tokens cut). */
function endsAtBoundary(text: string): boolean {
  return /[.!?…]["']?$/.test(text) || text.endsWith("***") || text.endsWith("---") || text.endsWith("⁂");
}

/** Join text onto the last document section without creating a new paragraph. */
async function joinToLastSection(text: string): Promise<void> {
  const ids = await api.v1.document.sectionIds();
  const lastId = ids[ids.length - 1];
  const results = await api.v1.document.scan(undefined, { from: lastId });
  const lastText = results[0].section.text;
  await api.v1.document.updateParagraph(lastId, { text: lastText + " " + text });
}

/** True if the document's final section is already a scene break marker. */
async function lastSectionIsBreak(): Promise<boolean> {
  const ids = await api.v1.document.sectionIds();
  if (ids.length === 0) return false;
  const results = await api.v1.document.scan(undefined, { from: ids[ids.length - 1] });
  return /^(\*\*\*|---|⁂)\s*$/.test(results[0].section.text.trim());
}

// Phrases that open a time-skipped scene. If an iteration begins with one of
// these, the model has silently time-jumped and we insert a scene break before
// the prose so the document reads correctly.
const TIME_SKIP_RE =
  /^\s*(?:(?:\w+\s+)?(?:years?|months?|weeks?|days?|hours?|decades?|minutes?)\s+(?:later|after|passed|had passed|ago|went by)|(?:Later|Afterward|Afterwards|Eventually|Meanwhile|Subsequently|Much later|Years later|Months later|Weeks later|Days later)[,.\s]|By the time|The (?:next|following) (?:day|week|month|year|morning|afternoon|evening))/i;

// ─── Phase 1 handler ─────────────────────────────────────────────────────────

export const bootstrapHandler: GenerationHandlers<BootstrapTarget> = {
  streaming(ctx: StreamingContext<BootstrapTarget>, _newText: string): void {
    const tail = ctx.accumulatedText.slice(-100).replace(/\n/g, " ");
    api.v1.ui.updateParts([{ id: "header-sega-status", text: tail }]);
  },

  async completion(ctx: CompletionContext<BootstrapTarget>): Promise<void> {
    if (!ctx.generationSucceeded || !ctx.accumulatedText) return;

    // Race protection: bail if document was populated while generating
    const sectionIds = await api.v1.document.sectionIds();
    if (sectionIds.length > 0) {
      api.v1.ui.updateParts([{ id: "header-sega-status", text: "" }]);
      return;
    }

    const chunks = parseParagraphs(ctx.accumulatedText);
    for (const chunk of chunks) {
      await api.v1.document.appendParagraph({ text: chunk });
    }
    if (chunks.length > 0) {
      // If Phase 1 ended mid-sentence, Phase 2 iter 0 must join inline.
      continueInline = !endsAtBoundary(chunks[chunks.length - 1]);
    }

    // Chain into phase 2
    const strategy = buildBootstrapContinueStrategy(ctx.getState, 0);
    ctx.dispatch(
      requestQueued({ id: strategy.requestId, type: "bootstrapContinue", targetId: "bootstrap" }),
    );
    ctx.dispatch(generationSubmitted(strategy));
  },
};

// ─── Phase 2 handler ─────────────────────────────────────────────────────────

export const bootstrapContinueHandler: GenerationHandlers<BootstrapContinueTarget> = {
  streaming(ctx: StreamingContext<BootstrapContinueTarget>, _newText: string): void {
    const tail = ctx.accumulatedText.slice(-100).replace(/\n/g, " ");
    api.v1.ui.updateParts([{ id: "header-sega-status", text: `[${ctx.target.iteration + 2}] ${tail}` }]);
  },

  async completion(ctx: CompletionContext<BootstrapContinueTarget>): Promise<void> {
    if (!ctx.generationSucceeded || !ctx.accumulatedText) {
      continueInline = false;
      api.v1.ui.updateParts([{ id: "header-sega-status", text: "" }]);
      return;
    }

    const stripped = stripThinkingTags(ctx.accumulatedText);
    // The model emitted an explicit scene break — preserve it.
    const endsOnSceneBreak = /\n\s*(?:\*\*\*|---|⁂)\s*$/.test(stripped);

    const cleaned = trimStopTail(stripped, ["\n***", "\n---", "\n⁂", "\n[ "]);
    const paragraphs = parseParagraphs(cleaned);

    // The model silently time-skipped without a marker — insert one.
    const needsLeadingBreak =
      paragraphs.length > 0 &&
      !continueInline &&
      TIME_SKIP_RE.test(paragraphs[0]) &&
      !(await lastSectionIsBreak());
    if (needsLeadingBreak) {
      await api.v1.document.appendParagraph({ text: "***" });
    }

    if (paragraphs.length > 0) {
      const [first, ...rest] = paragraphs;
      if (continueInline && !needsLeadingBreak) {
        await joinToLastSection(first);
      } else {
        await api.v1.document.appendParagraph({ text: first });
      }
      for (const p of rest) {
        await api.v1.document.appendParagraph({ text: p });
      }
    }

    if (endsOnSceneBreak) {
      if (!(await lastSectionIsBreak())) {
        await api.v1.document.appendParagraph({ text: "***" });
      }
      continueInline = false;
    } else if (paragraphs.length > 0) {
      continueInline = !endsAtBoundary(paragraphs[paragraphs.length - 1]);
    }

    const maxReached = ctx.target.iteration >= MAX_CONTINUE_ITERATIONS - 1;
    if (maxReached) {
      continueInline = false;
      api.v1.ui.updateParts([{ id: "header-sega-status", text: "" }]);
      return;
    }

    // Queue next iteration
    const strategy = buildBootstrapContinueStrategy(ctx.getState, ctx.target.iteration + 1);
    ctx.dispatch(
      requestQueued({ id: strategy.requestId, type: "bootstrapContinue", targetId: "bootstrap" }),
    );
    ctx.dispatch(generationSubmitted(strategy));
  },
};
