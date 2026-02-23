/**
 * Crucible Chain Handlers — Structural goal, prerequisites, elements, expansion.
 */

import {
  GenerationHandlers,
  StreamingContext,
  CompletionContext,
} from "../generation-handlers";
import {
  structuralGoalDerived,
  prerequisitesDerived,
  elementsDerived,
} from "../../index";
import { IDS } from "../../../../ui/framework/ids";
import {
  parseTag,
  splitSections,
} from "../../../utils/tag-parser";
import { DulfsFieldID, FieldID } from "../../../../config/field-definitions";
import { CrucibleWorldElement, Prerequisite, PrereqCategory } from "../../types";

/** Strip thinking-tag breakout artifacts from generated text. */
function stripThinkingTags(text: string): string {
  return text.replace(/<\/?think>/g, "").replace(/<think>[\s\S]*$/g, "");
}

/** Map builder tag names to DULFS field IDs. */
const TAG_TO_FIELD: Record<string, DulfsFieldID> = {
  CHARACTER: FieldID.DramatisPersonae,
  LOCATION: FieldID.Locations,
  FACTION: FieldID.Factions,
  SYSTEM: FieldID.UniverseSystems,
  SITUATION: FieldID.SituationalDynamics,
};

const ELEMENT_TAGS = Object.keys(TAG_TO_FIELD);

const VALID_CATEGORIES = new Set<string>(["RELATIONSHIP", "SECRET", "POWER", "HISTORY", "OBJECT", "BELIEF", "PLACE"]);

// --- Target types ---

type StructuralGoalTarget = { type: "crucibleStructuralGoal"; goalId: string };
type PrereqsTarget = { type: "cruciblePrereqs" };
type ElementsTarget = { type: "crucibleElements" };
type ExpansionTarget = { type: "crucibleExpansion"; elementId?: string };

// --- Structural Goal Handler ---

export const structuralGoalHandler: GenerationHandlers<StructuralGoalTarget> = {
  streaming(ctx: StreamingContext<StructuralGoalTarget>): void {
    const text = stripThinkingTags(ctx.accumulatedText);
    const tail = text.replace(/\n+/g, " ").slice(-120);
    api.v1.ui.updateParts([{ id: IDS.CRUCIBLE.TICKER_TEXT, text: tail }]);
  },

  async completion(ctx: CompletionContext<StructuralGoalTarget>): Promise<void> {
    if (!ctx.generationSucceeded || !ctx.accumulatedText) return;

    const { goalId } = ctx.target;
    const text = stripThinkingTags(ctx.accumulatedText).trim();

    const goalText = parseTag(text, "GOAL");
    const whyText = parseTag(text, "WHY") || "";

    if (goalText) {
      ctx.dispatch(structuralGoalDerived({
        goal: {
          id: api.v1.uuid(),
          sourceGoalId: goalId,
          text: goalText,
          why: whyText,
        },
      }));
      api.v1.log(`[crucible] Structural goal derived for ${goalId}: ${goalText.slice(0, 80)}`);
    } else {
      api.v1.log("[crucible] Structural goal parse: missing [GOAL]");
      api.v1.log("[crucible] Raw text:", text.slice(0, 500));
    }
  },
};

// --- Prerequisites Handler ---

function parsePrerequisites(text: string): Prerequisite[] {
  const sections = splitSections(text, "+++");
  const prereqs: Prerequisite[] = [];

  for (const section of sections) {
    const element = parseTag(section, "PREREQ");
    const loadBearing = parseTag(section, "LOADBEARING") || "";
    const rawCategory = (parseTag(section, "CATEGORY") || "").trim().toUpperCase();
    const category: PrereqCategory = VALID_CATEGORIES.has(rawCategory)
      ? rawCategory as PrereqCategory
      : "RELATIONSHIP";

    if (element) {
      prereqs.push({
        id: api.v1.uuid(),
        element,
        loadBearing,
        category,
        satisfiedBy: [],
      });
    }
  }

  return prereqs;
}

export const prerequisitesHandler: GenerationHandlers<PrereqsTarget> = {
  streaming(ctx: StreamingContext<PrereqsTarget>): void {
    const text = stripThinkingTags(ctx.accumulatedText);
    const tail = text.replace(/\n+/g, " ").slice(-120);
    api.v1.ui.updateParts([{ id: IDS.CRUCIBLE.TICKER_TEXT, text: tail }]);
  },

  async completion(ctx: CompletionContext<PrereqsTarget>): Promise<void> {
    if (!ctx.generationSucceeded || !ctx.accumulatedText) return;

    const text = stripThinkingTags(ctx.accumulatedText).trim();
    const prereqs = parsePrerequisites(text);

    if (prereqs.length > 0) {
      ctx.dispatch(prerequisitesDerived({ prerequisites: prereqs }));
      api.v1.log(`[crucible] ${prereqs.length} prerequisites derived`);
    } else {
      api.v1.log("[crucible] Prerequisites parse: no valid prereqs found");
      api.v1.log("[crucible] Raw text:", text.slice(0, 500));
    }
  },
};

// --- Elements Handler ---

function parseElements(text: string): CrucibleWorldElement[] {
  const sections = splitSections(text, "+++");
  const elements: CrucibleWorldElement[] = [];

  for (const section of sections) {
    // Find which element tag is present
    let fieldId: DulfsFieldID | null = null;
    let name: string | null = null;

    for (const tag of ELEMENT_TAGS) {
      const parsed = parseTag(section, tag);
      if (parsed) {
        fieldId = TAG_TO_FIELD[tag];
        name = parsed;
        break;
      }
    }

    if (!fieldId || !name) continue;

    const description = parseTag(section, "DESCRIPTION") || "";
    const want = parseTag(section, "WANT") || undefined;
    const need = parseTag(section, "NEED") || undefined;
    const relationship = parseTag(section, "RELATIONSHIP") || undefined;
    const satisfiesRaw = parseTag(section, "SATISFIES") || "";
    const satisfies = satisfiesRaw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    elements.push({
      id: api.v1.uuid(),
      fieldId,
      name,
      content: description,
      want,
      need,
      relationship,
      satisfies,
    });
  }

  return elements;
}

export const elementsHandler: GenerationHandlers<ElementsTarget> = {
  streaming(ctx: StreamingContext<ElementsTarget>): void {
    const text = stripThinkingTags(ctx.accumulatedText);
    const tail = text.replace(/\n+/g, " ").slice(-120);
    api.v1.ui.updateParts([{ id: IDS.CRUCIBLE.TICKER_TEXT, text: tail }]);
  },

  async completion(ctx: CompletionContext<ElementsTarget>): Promise<void> {
    if (!ctx.generationSucceeded || !ctx.accumulatedText) return;

    const text = stripThinkingTags(ctx.accumulatedText).trim();
    const elements = parseElements(text);

    if (elements.length > 0) {
      ctx.dispatch(elementsDerived({ elements }));
      api.v1.log(`[crucible] ${elements.length} world elements derived`);
    } else {
      api.v1.log("[crucible] Elements parse: no valid elements found");
      api.v1.log("[crucible] Raw text:", text.slice(0, 500));
    }
  },
};

// --- Expansion Handler ---

export const expansionHandler: GenerationHandlers<ExpansionTarget> = {
  streaming(ctx: StreamingContext<ExpansionTarget>): void {
    const text = stripThinkingTags(ctx.accumulatedText);
    const tail = text.replace(/\n+/g, " ").slice(-120);
    api.v1.ui.updateParts([{ id: IDS.CRUCIBLE.TICKER_TEXT, text: tail }]);
  },

  async completion(ctx: CompletionContext<ExpansionTarget>): Promise<void> {
    if (!ctx.generationSucceeded || !ctx.accumulatedText) return;

    const text = stripThinkingTags(ctx.accumulatedText).trim();

    // Parse prereqs from the expansion output — go directly into main prerequisites
    const prereqs = parsePrerequisites(text);
    if (prereqs.length > 0) {
      ctx.dispatch(prerequisitesDerived({ prerequisites: prereqs }));
      api.v1.log(`[crucible] Expansion: ${prereqs.length} prerequisites derived`);
    }

    // Also parse any elements directly emitted
    const elements = parseElements(text);
    if (elements.length > 0) {
      ctx.dispatch(elementsDerived({ elements }));
      api.v1.log(`[crucible] Expansion: ${elements.length} elements derived`);
    }
  },
};
