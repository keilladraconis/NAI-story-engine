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

// When true, the next Continue Scene joins the last document section inline
// rather than starting a new paragraph. Set when a generation ends mid-sentence
// (max_tokens fired before a natural boundary). Reset on a clean end or failure.
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
function stripTrailingSceneBreak(text: string): {
  text: string;
  hadBreak: boolean;
} {
  const hadBreak = SCENE_BREAK_TAIL.test(text);
  return {
    text: hadBreak ? text.replace(SCENE_BREAK_TAIL, "").trimEnd() : text,
    hadBreak,
  };
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

    const { text: cleaned, hadBreak } = stripTrailingSceneBreak(
      stripThinkingTags(ctx.accumulatedText),
    );
    const chunks = parseParagraphs(cleaned);
    if (chunks.length > 0) {
      // append() writes the opening as real paragraphs (each newline becomes a
      // paragraph break). The engine still records one undo step per paragraph —
      // multi-paragraph single-undo isn't reachable through the document API.
      await api.v1.document.append(chunks.join("\n"));
      // An opening cut mid-sentence is stitched onto by the next Continue Scene.
      continueInline = !hadBreak && !endsAtBoundary(chunks[chunks.length - 1]);
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
      if (!ctx.generationSucceeded || !ctx.accumulatedText) {
        continueInline = false;
        return;
      }

      const { text: noBreak, hadBreak } = stripTrailingSceneBreak(
        stripThinkingTags(ctx.accumulatedText),
      );
      const sections = await api.v1.document.scan();
      const lastParagraph = sections[sections.length - 1]?.section.text ?? "";
      const paragraphs = parseParagraphs(
        dropEchoedTail(trimStopTail(noBreak, ["\n[ "]), lastParagraph),
      );
      if (paragraphs.length === 0) {
        if (hadBreak) continueInline = false;
        return;
      }

      // A leading newline starts a fresh paragraph; after a mid-sentence cut a
      // space stitches this onto the end of the last one instead.
      await api.v1.document.append(
        (continueInline ? " " : "\n") + paragraphs.join("\n"),
      );
      continueInline =
        !hadBreak && !endsAtBoundary(paragraphs[paragraphs.length - 1]);

      // One passage per press. No auto-chain and no cap.
    },
  };
