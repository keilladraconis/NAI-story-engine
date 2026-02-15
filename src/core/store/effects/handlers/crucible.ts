import {
  GenerationHandlers,
  CompletionContext,
} from "../generation-handlers";
import {
  CrucibleGoal,
  CrucibleBeat,
  Constraint,
  WorldElements,
  NamedElement,
  MergedElement,
  MergedElementType,
} from "../../types";
import {
  goalsSet,
  beatAdded,
  chainCompleted,
  checkpointSet,
  mergedWorldSet,
} from "../../index";

// --- Types for crucible targets ---

type CrucibleGoalsTarget = { type: "crucibleGoals" };
type CrucibleChainTarget = { type: "crucibleChain"; goalId: string };
type CrucibleMergeTarget = { type: "crucibleMerge" };

// --- JSON Repair ---

/**
 * Find the balanced closing brace for a `{` at position `start`.
 * Respects string quoting (skips braces inside JSON strings).
 * Returns -1 if no balanced close found.
 */
function findBalancedClose(text: string, start: number): number {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{" || ch === "[") depth++;
    else if (ch === "}" || ch === "]") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Strip markdown fencing, find balanced JSON object, fix trailing commas.
 */
function repairJSON(text: string): string {
  let cleaned = text.replace(/^```(?:json)?\s*/gm, "").replace(/```\s*$/gm, "");

  const start = cleaned.indexOf("{");
  if (start === -1) return cleaned.trim();

  // Try balanced extraction first
  const balancedEnd = findBalancedClose(cleaned, start);
  if (balancedEnd !== -1) {
    cleaned = cleaned.slice(start, balancedEnd + 1);
  } else {
    // Truncated — take from start to last } and hope for the best
    const end = cleaned.lastIndexOf("}");
    if (end > start) {
      cleaned = cleaned.slice(start, end + 1);
    } else {
      // No closing brace at all — try to close it
      let truncated = cleaned.slice(start);
      const lastBracket = truncated.lastIndexOf("]");
      if (lastBracket > 0) truncated = truncated.slice(0, lastBracket + 1) + "}";
      else truncated += "}";
      cleaned = truncated;
    }
  }

  // Fix trailing commas before } or ] (common GLM output issue)
  cleaned = cleaned.replace(/,\s*([}\]])/g, "$1");

  return cleaned;
}

/** Parse an array of NamedElement from raw JSON array. */
function parseNamedElements(arr: unknown): NamedElement[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((item): item is { name: string; description: string } =>
      typeof item === "object" && item !== null && typeof (item as any).name === "string",
    )
    .map((item) => ({
      name: String(item.name),
      description: String((item as any).description || ""),
    }));
}

/** Parse WorldElements from a raw JSON object. */
function parseWorldElements(obj: unknown): WorldElements {
  if (typeof obj !== "object" || obj === null) {
    return { characters: [], locations: [], factions: [], systems: [], situations: [] };
  }
  const o = obj as Record<string, unknown>;
  return {
    characters: parseNamedElements(o.characters),
    locations: parseNamedElements(o.locations),
    factions: parseNamedElements(o.factions),
    systems: parseNamedElements(o.systems),
    situations: parseNamedElements(o.situations),
  };
}

// --- Goals Handler ---

export const crucibleGoalsHandler: GenerationHandlers<CrucibleGoalsTarget> = {
  streaming(): void {
    // No-op — JSON accumulates silently
  },

  async completion(ctx: CompletionContext<CrucibleGoalsTarget>): Promise<void> {
    if (!ctx.generationSucceeded || !ctx.accumulatedText) return;

    try {
      const json = repairJSON(ctx.accumulatedText);
      const parsed = JSON.parse(json) as {
        goals?: Array<{
          goal?: string;
          stakes?: string;
          theme?: string;
          emotionalArc?: string;
          emotional_arc?: string;
          terminalCondition?: string;
          terminal_condition?: string;
        }>;
      };

      const goalsArray = parsed.goals;
      if (!Array.isArray(goalsArray) || goalsArray.length === 0) {
        api.v1.log("[crucible] Goals parse: missing goals array. Raw:", ctx.accumulatedText.slice(0, 500));
        return;
      }

      const goals: CrucibleGoal[] = [];
      for (const element of goalsArray) {
        if (!element.goal) continue;

        goals.push({
          id: api.v1.uuid(),
          goal: String(element.goal),
          stakes: String(element.stakes || ""),
          theme: String(element.theme || ""),
          emotionalArc: String(element.emotionalArc || element.emotional_arc || ""),
          terminalCondition: String(element.terminalCondition || element.terminal_condition || ""),
          selected: true,
        });
      }

      if (goals.length > 0) {
        ctx.dispatch(goalsSet({ goals }));
      }
    } catch (e) {
      api.v1.log("[crucible] Goals JSON parse failed:", e);
      api.v1.log("[crucible] Raw text:", ctx.accumulatedText.slice(0, 500));
    }
  },
};

// --- Chain Handler ---

export const crucibleChainHandler: GenerationHandlers<CrucibleChainTarget> = {
  streaming(): void {
    // No-op — JSON accumulates silently
  },

  async completion(ctx: CompletionContext<CrucibleChainTarget>): Promise<void> {
    if (!ctx.generationSucceeded || !ctx.accumulatedText) return;

    const { goalId } = ctx.target;
    const state = ctx.getState();
    const chain = state.crucible.chains[goalId];
    if (!chain) return;

    try {
      const json = repairJSON(ctx.accumulatedText);
      const parsed = JSON.parse(json) as {
        scene?: string;
        charactersPresent?: string[];
        characters_present?: string[];
        location?: string;
        conflictTension?: string;
        conflict_tension?: string;
        conflict?: string;
        worldElementsIntroduced?: unknown;
        world_elements_introduced?: unknown;
        world_elements?: unknown;
        constraintsResolved?: string[];
        constraints_resolved?: string[];
        newOpenConstraints?: string[];
        new_open_constraints?: string[];
        groundStateConstraints?: string[];
        ground_state_constraints?: string[];
      };

      if (!parsed.scene) {
        api.v1.log("[crucible] Chain parse: missing scene");
        return;
      }

      const beat: CrucibleBeat = {
        scene: String(parsed.scene),
        charactersPresent: (parsed.charactersPresent || parsed.characters_present || []).map(String),
        location: String(parsed.location || ""),
        conflictTension: String(parsed.conflictTension || parsed.conflict_tension || parsed.conflict || ""),
        worldElementsIntroduced: parseWorldElements(
          parsed.worldElementsIntroduced || parsed.world_elements_introduced || parsed.world_elements,
        ),
        constraintsResolved: (parsed.constraintsResolved || parsed.constraints_resolved || []).map(String),
        newOpenConstraints: (parsed.newOpenConstraints || parsed.new_open_constraints || []).map(String),
        groundStateConstraints: (parsed.groundStateConstraints || parsed.ground_state_constraints || []).map(String),
      };

      const beatIndex = chain.beats.length; // index of the new beat

      // Build constraint update objects
      const opened: Constraint[] = beat.newOpenConstraints.map((desc) => ({
        id: api.v1.uuid(),
        description: desc,
        sourceBeatIndex: beatIndex,
        status: "open" as const,
      }));

      ctx.dispatch(beatAdded({
        goalId,
        beat,
        constraints: {
          resolved: beat.constraintsResolved,
          opened,
          grounded: beat.groundStateConstraints,
        },
      }));

      // --- Checkpoint detection ---
      const updatedState = ctx.getState();
      const updatedChain = updatedState.crucible.chains[goalId];
      if (!updatedChain) return;

      // (a) Major character introduction (1st or 2nd character across beats)
      const totalChars = updatedChain.worldElements.characters.length;
      const newChars = beat.worldElementsIntroduced.characters.length;
      if (newChars > 0 && totalChars <= 2) {
        ctx.dispatch(checkpointSet({ reason: `Major character introduced: ${beat.worldElementsIntroduced.characters.map((c) => c.name).join(", ")}` }));
      }

      // (b) Constraint explosion: net growth >2 for 3 consecutive beats
      if (updatedChain.beats.length >= 3) {
        const lastThree = updatedChain.beats.slice(-3);
        const explosionCount = lastThree.filter(
          (b) => b.newOpenConstraints.length - b.constraintsResolved.length > 2,
        ).length;
        if (explosionCount >= 3) {
          ctx.dispatch(checkpointSet({ reason: "Constraint explosion — open constraints growing faster than resolving" }));
        }
      }

      // (c) Beat count threshold
      if (updatedChain.beats.length >= 15) {
        ctx.dispatch(checkpointSet({ reason: "Chain reached 15 beats — consider consolidating" }));
      }

      // Chain completion: all open constraints resolved
      if (updatedChain.openConstraints.length === 0 && updatedChain.beats.length > 0) {
        ctx.dispatch(chainCompleted({ goalId }));
      }
    } catch (e) {
      api.v1.log("[crucible] Chain JSON parse failed:", e);
      api.v1.log("[crucible] Raw text:", ctx.accumulatedText.slice(0, 500));
    }
  },
};

// --- Merge Handler ---

const VALID_ELEMENT_TYPES = new Set<string>(["character", "location", "faction", "system", "situation"]);

export const crucibleMergeHandler: GenerationHandlers<CrucibleMergeTarget> = {
  streaming(): void {
    // No-op — JSON accumulates silently
  },

  async completion(ctx: CompletionContext<CrucibleMergeTarget>): Promise<void> {
    if (!ctx.generationSucceeded || !ctx.accumulatedText) return;

    try {
      const json = repairJSON(ctx.accumulatedText);
      const parsed = JSON.parse(json) as {
        elements?: Array<{
          name?: string;
          type?: string;
          description?: string;
          goalPurposes?: Record<string, string>;
          goal_purposes?: Record<string, string>;
          relationships?: string[];
        }>;
      };

      if (!Array.isArray(parsed.elements) || parsed.elements.length === 0) {
        api.v1.log("[crucible] Merge parse: missing elements array");
        return;
      }

      const elements: MergedElement[] = [];
      for (const el of parsed.elements) {
        if (!el.name || !el.type) continue;
        if (!VALID_ELEMENT_TYPES.has(el.type)) continue;

        elements.push({
          name: String(el.name),
          type: String(el.type) as MergedElementType,
          description: String(el.description || ""),
          goalPurposes: el.goalPurposes || el.goal_purposes || {},
          relationships: Array.isArray(el.relationships) ? el.relationships.map(String) : [],
        });
      }

      if (elements.length > 0) {
        ctx.dispatch(mergedWorldSet({ mergedWorld: { elements } }));
      }
    } catch (e) {
      api.v1.log("[crucible] Merge JSON parse failed:", e);
      api.v1.log("[crucible] Raw text:", ctx.accumulatedText.slice(0, 500));
    }
  },
};
