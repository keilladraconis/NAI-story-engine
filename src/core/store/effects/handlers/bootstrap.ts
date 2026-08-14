import { GenerationStrategy } from "../../types";
import {
  GenerationHandlers,
  StreamingContext,
  CompletionContext,
} from "../generation-handlers";
import { stripThinkingTags } from "../../../utils/tag-parser";

type BootstrapTarget = Extract<
  GenerationStrategy["target"],
  { type: "bootstrap" }
>;
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

    const { text: cleaned } = stripTrailingSceneBreak(
      stripThinkingTags(ctx.accumulatedText),
    );
    const chunks = parseParagraphs(cleaned);
    if (chunks.length > 0) {
      // append() writes the opening as real paragraphs (each newline becomes a
      // paragraph break). The engine still records one undo step per paragraph —
      // multi-paragraph single-undo isn't reachable through the document API.
      await api.v1.document.append(chunks.join("\n"));
    }

    // The opening is on the page and the stage is done. Continuing the scene is
    // the story editor's job — Story Engine has no Continue control.
  },
};
