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

// When true, the next "Continue Scene" should join the last document section inline
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
  return (
    /[.!?…]["']?$/.test(text) ||
    text.endsWith("***") ||
    text.endsWith("---") ||
    text.endsWith("⁂")
  );
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

    const { text: cleaned, hadBreak } = stripTrailingSceneBreak(
      stripThinkingTags(ctx.accumulatedText),
    );
    const chunks = parseParagraphs(cleaned);
    if (chunks.length > 0) {
      // append() writes the opening as real paragraphs (each newline becomes a
      // paragraph break). The engine still records one undo step per paragraph —
      // multi-paragraph single-undo isn't reachable through the document API.
      await api.v1.document.append(chunks.join("\n"));
      // If the opening ended mid-sentence (no clean break), the next "Continue
      // Scene" joins inline.
      continueInline = !hadBreak && !endsAtBoundary(chunks[chunks.length - 1]);
    }

    // Stage stops here. The opening is on the page; the header button now offers
    // "Continue Scene", and the user decides whether to extend it.
    api.v1.ui.updateParts([{ id: "header-sega-status", text: "" }]);
  },
};

// ─── Phase 2 handler ─────────────────────────────────────────────────────────

export const bootstrapContinueHandler: GenerationHandlers<BootstrapContinueTarget> =
  {
    streaming(
      ctx: StreamingContext<BootstrapContinueTarget>,
      _newText: string,
    ): void {
      const tail = ctx.accumulatedText.slice(-100).replace(/\n/g, " ");
      api.v1.ui.updateParts([
        {
          id: "header-sega-status",
          text: `[${ctx.target.iteration + 2}] ${tail}`,
        },
      ]);
    },

    async completion(
      ctx: CompletionContext<BootstrapContinueTarget>,
    ): Promise<void> {
      if (!ctx.generationSucceeded || !ctx.accumulatedText) {
        continueInline = false;
        api.v1.ui.updateParts([{ id: "header-sega-status", text: "" }]);
        return;
      }

      const { text: noBreak, hadBreak: endsOnSceneBreak } =
        stripTrailingSceneBreak(stripThinkingTags(ctx.accumulatedText));
      const cleaned = trimStopTail(noBreak, ["\n[ "]);
      const paragraphs = parseParagraphs(cleaned);

      if (paragraphs.length > 0) {
        // A leading newline starts a fresh paragraph; when the previous stage was
        // cut mid-sentence we lead with a space instead so this stitches onto the
        // end of the last paragraph.
        const body = paragraphs.join("\n");
        await api.v1.document.append((continueInline ? " " : "\n") + body);

        continueInline = endsOnSceneBreak
          ? false
          : !endsAtBoundary(paragraphs[paragraphs.length - 1]);
      } else if (endsOnSceneBreak) {
        continueInline = false;
      }

      // One paragraph per click. No auto-chain and no cap — the user keeps the
      // wheel: the header button stays on "Continue Scene" for the next push.
      api.v1.ui.updateParts([{ id: "header-sega-status", text: "" }]);
    },
  };
