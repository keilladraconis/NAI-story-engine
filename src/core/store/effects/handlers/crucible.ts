import {
  GenerationHandlers,
  StreamingContext,
  CompletionContext,
} from "../generation-handlers";
import {
  tensionsDerived,
  directionSet,
  updateShape,
} from "../../index";
import { IDS } from "../../../../ui/framework/ids";
import { CrucibleTension } from "../../types";
import { splitSections, stripThinkingTags } from "../../../utils/tag-parser";

// --- Types for crucible targets ---

type CrucibleDirectionTarget = { type: "crucibleDirection" };
type CrucibleShapeTarget = { type: "crucibleShape"; prefillName?: string };
type CrucibleTensionTarget = { type: "crucibleTension" };

// --- Direction Handler ---

export const crucibleDirectionHandler: GenerationHandlers<CrucibleDirectionTarget> = {
  streaming(ctx: StreamingContext<CrucibleDirectionTarget>): void {
    const clean = stripThinkingTags(ctx.accumulatedText);
    const display = clean.replace(/\n/g, "  \n").replace(/</g, "\\<");
    const tail = clean.replace(/\n+/g, " ").slice(-120);
    api.v1.ui.updateParts([
      { id: `${IDS.CRUCIBLE.DIRECTION_TEXT}-view`, text: display },
      { id: IDS.CRUCIBLE.TICKER_TEXT, text: tail },
    ]);
  },

  async completion(ctx: CompletionContext<CrucibleDirectionTarget>): Promise<void> {
    if (!ctx.generationSucceeded || !ctx.accumulatedText) return;

    const text = stripThinkingTags(ctx.accumulatedText).trim();
    if (text.length > 0) {
      ctx.dispatch(directionSet({ direction: text }));
    } else {
      api.v1.log("[crucible] Direction generation produced empty text");
    }
  },
};

// --- Generative Shape Handler ---

const SHAPE_FALLBACK = {
  name: "STORY",
  instruction: "Lean toward the moment that best captures the story's essential nature.",
};

export const crucibleShapeHandler: GenerationHandlers<CrucibleShapeTarget> = {
  streaming(ctx: StreamingContext<CrucibleShapeTarget>): void {
    const text = stripThinkingTags(ctx.accumulatedText);
    const display = text.replace(/\n/g, "  \n").replace(/</g, "\\<");
    api.v1.ui.updateParts([
      { id: `${IDS.CRUCIBLE.SHAPE_TEXT}-view`, text: display },
      { id: IDS.CRUCIBLE.TICKER_TEXT, text: text.replace(/\n+/g, " ").slice(-60) },
    ]);
  },

  async completion(ctx: CompletionContext<CrucibleShapeTarget>): Promise<void> {
    if (!ctx.generationSucceeded || !ctx.accumulatedText) return;

    const text = stripThinkingTags(ctx.accumulatedText).trim();

    // When a name was prefilled, the output IS the instruction — no parsing needed
    if (ctx.target.prefillName) {
      api.v1.log(`[crucible] Shape generated (prefill): ${ctx.target.prefillName}`);
      ctx.dispatch(updateShape({
        name: ctx.target.prefillName,
        instruction: text || SHAPE_FALLBACK.instruction,
      }));
      return;
    }

    // Otherwise: prefillBehavior "trim" stripped "SHAPE: " — first line is the name
    const blankLine = text.indexOf("\n\n");
    const name = (blankLine !== -1 ? text.slice(0, blankLine) : text.split("\n")[0]).trim();
    const instruction = (blankLine !== -1 ? text.slice(blankLine) : "").trim();

    if (!name) {
      api.v1.log("[crucible] Shape parse failed — using fallback shape");
      ctx.dispatch(updateShape(SHAPE_FALLBACK));
      return;
    }

    api.v1.log(`[crucible] Shape generated: ${name}`);
    ctx.dispatch(updateShape({ name, instruction: instruction || SHAPE_FALLBACK.instruction }));
  },
};

// --- Tension Handler ---

/**
 * Parse [TENSION] tags from GLM output. Sections separated by +++ or newlines.
 */
function parseTensions(text: string): CrucibleTension[] {
  // Try +++ sections first
  const sections = splitSections(text, "+++");
  const tensions: CrucibleTension[] = [];

  for (const section of sections) {
    // Extract content after [TENSION] tag
    const marker = "[TENSION]";
    const idx = section.indexOf(marker);
    const content = idx !== -1
      ? section.slice(idx + marker.length).trim()
      : section.trim();

    if (content) {
      tensions.push({
        id: api.v1.uuid(),
        text: content,
        accepted: true,
      });
    }
  }

  return tensions;
}

export const crucibleTensionHandler: GenerationHandlers<CrucibleTensionTarget> = {
  streaming(ctx: StreamingContext<CrucibleTensionTarget>): void {
    const stripped = stripThinkingTags(ctx.accumulatedText);
    const tail = stripped.replace(/\n+/g, " ").slice(-120);
    api.v1.ui.updateParts([
      { id: IDS.CRUCIBLE.TICKER_TEXT, text: tail },
    ]);
  },

  async completion(ctx: CompletionContext<CrucibleTensionTarget>): Promise<void> {
    if (!ctx.generationSucceeded || !ctx.accumulatedText) return;

    const text = stripThinkingTags(ctx.accumulatedText).trim();
    const tensions = parseTensions(text);

    if (tensions.length > 0) {
      ctx.dispatch(tensionsDerived({ tensions }));
      api.v1.log(`[crucible] ${tensions.length} tensions derived`);
    } else {
      api.v1.log("[crucible] Tension parse: no valid tensions found");
      api.v1.log("[crucible] Raw text:", text.slice(0, 500));
    }
  },
};
