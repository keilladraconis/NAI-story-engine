import { GenerationStrategy } from "../../types";
import {
  GenerationHandlers,
  StreamingContext,
  CompletionContext,
} from "../generation-handlers";
import { stripThinkingTags } from "../../../utils/tag-parser";
import { trimStopTail } from "../../../utils/config";

type BootstrapTarget = Extract<
  GenerationStrategy["target"],
  { type: "bootstrap" }
>;
type BootstrapContinueTarget = Extract<
  GenerationStrategy["target"],
  { type: "bootstrapContinue" }
>;

// A style tag the model writes before its prose, copying the "[ Style: … ]"
// line it was sent. The "\n[ " stop only catches one after a newline.
const LEADING_TAG = /^\s*\[[^\]\n]*\]/;

// Prose never starts a line with a markdown heading. One is the model writing
// about the passage ("## Scene Analysis"), and nothing after it is story.
const HEADING = /^#{1,6} /m;

function untilHeading(text: string): string {
  const at = text.search(HEADING);
  return at === -1 ? text : text.slice(0, at);
}

function parseParagraphs(text: string): string[] {
  return toLastSentence(
    untilHeading(stripThinkingTags(text).replace(LEADING_TAG, ""))
      .trim()
      .split(/\n\n+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0 && !/^[\*\-#=~\s]+$/.test(p))
      .flatMap(chunkParagraph),
  );
}

/** A passage max_tokens cut off ends mid-sentence. Keep it to its last full
 *  sentence, so every passage ends whole and the next starts a paragraph of
 *  its own; stitched onto a fragment, a continuation drifted instead. */
function toLastSentence(paragraphs: string[]): string[] {
  const last = paragraphs[paragraphs.length - 1];
  if (last === undefined || endsAtBoundary(last)) return paragraphs;
  const sentences = splitIntoSentences(last);
  let whole = sentences.length;
  while (whole > 0 && !endsAtBoundary(sentences[whole - 1])) whole--;
  const kept = sentences.slice(0, whole).join(" ");
  return [...paragraphs.slice(0, -1), ...(kept ? [kept] : [])];
}

/** A continuation sometimes starts over, writing again paragraphs the page
 *  already has. Drop the ones it opens with. */
function dropRepeated(paragraphs: string[], page: Set<string>): string[] {
  let first = 0;
  while (first < paragraphs.length && page.has(paragraphs[first])) first++;
  return paragraphs.slice(first);
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

/** True when text ended at a natural sentence boundary, not a max_tokens cut. */
function endsAtBoundary(text: string): boolean {
  return /[.!?…]["'”’]?$/.test(text);
}

/** A continuation often opens by restating the page's last paragraph before
 *  going on. Drop that echo so the line is not on the page twice. */
export function dropEchoedTail(text: string, lastParagraph: string): string {
  const tail = lastParagraph.trim();
  const body = text.trimStart();
  return tail.length > 0 && body.startsWith(tail)
    ? body.slice(tail.length).trimStart()
    : text;
}

// A scene-break marker the model appends to close a scene. We render these as a
// proper centered "***" section rather than leaving the glyph in the prose.
const SCENE_BREAK_TAIL = /\s*(?:\*{3,}|-{3,}|⁂)\s*$/;

/**
 * Strip a trailing scene-break marker from generated prose. The model often
 * closes a scene with ***, ---, or ⁂ — and sometimes inline (space-separated)
 * rather than on its own line, which slips past the `\n`-prefixed stop
 * sequences and leaks the glyph into the document. This catches it either way.
 */
function stripTrailingSceneBreak(text: string): string {
  return text.replace(SCENE_BREAK_TAIL, "").trimEnd();
}

// ─── Phase 1 handler ─────────────────────────────────────────────────────────

export const bootstrapHandler: GenerationHandlers<BootstrapTarget> = {
  // The opening scene lands on the page on completion (document.append); there
  // is no live streaming preview in the JSX header — the dimmed Bootstrap button
  // signals that generation is in flight.
  streaming(_ctx: StreamingContext<BootstrapTarget>, _newText: string): void {},

  async completion(ctx: CompletionContext<BootstrapTarget>): Promise<void> {
    if (!ctx.generationSucceeded || !ctx.accumulatedText) return;

    // Race protection: bail if document was populated while generating
    const sectionIds = await api.v1.document.sectionIds();
    if (sectionIds.length > 0) {
      return;
    }

    const chunks = parseParagraphs(
      stripTrailingSceneBreak(stripThinkingTags(ctx.accumulatedText)),
    );
    if (chunks.length > 0) {
      // append() writes the opening as real paragraphs (each newline becomes a
      // paragraph break). The engine still records one undo step per paragraph —
      // multi-paragraph single-undo isn't reachable through the document API.
      await api.v1.document.append(chunks.join("\n"));
    }

    // The stage stops here. The card now offers Continue Scene, and the writer
    // decides whether to extend the opening.
  },
};

// ─── Phase 2 handler ─────────────────────────────────────────────────────────

export const bootstrapContinueHandler: GenerationHandlers<BootstrapContinueTarget> =
  {
    streaming(
      _ctx: StreamingContext<BootstrapContinueTarget>,
      _newText: string,
    ): void {},

    async completion(
      ctx: CompletionContext<BootstrapContinueTarget>,
    ): Promise<void> {
      if (!ctx.generationSucceeded || !ctx.accumulatedText) return;

      const noBreak = stripTrailingSceneBreak(
        stripThinkingTags(ctx.accumulatedText),
      );
      const sections = await api.v1.document.scan();
      const page = sections.map((s) => s.section.text.trim());
      const paragraphs = dropRepeated(
        parseParagraphs(
          dropEchoedTail(
            trimStopTail(noBreak, ["\n[ "]),
            page[page.length - 1] ?? "",
          ),
        ),
        new Set(page),
      );
      if (paragraphs.length === 0) return;

      // The leading newline starts a paragraph of its own.
      await api.v1.document.append("\n" + paragraphs.join("\n"));

      // One passage per press. No auto-chain and no cap.
    },
  };
