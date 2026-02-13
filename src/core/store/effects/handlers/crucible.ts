import {
  GenerationHandlers,
  CompletionContext,
} from "../generation-handlers";
import {
  CrucibleNode,
  CrucibleNodeKind,
} from "../../types";
import { crucibleSeeded, nodesAdded, roundAdvanced } from "../../index";

// --- Types for crucible targets ---

type CrucibleSeedTarget = { type: "crucibleSeed" };
type CrucibleExpandTarget = { type: "crucibleExpand"; round: number };

// --- Allowed node kinds for validation ---

const ALLOWED_KINDS: Set<string> = new Set<CrucibleNodeKind>([
  "intent", "beat", "character", "faction",
  "location", "system", "situation", "opener",
]);

// --- JSON Repair ---

/**
 * Strip markdown fencing and find the outermost JSON structure.
 * Returns cleaned string ready for JSON.parse.
 * Handles truncated output by attempting to close the structure.
 */
function repairJSON(text: string, anchor: "{" | "["): string {
  // Strip markdown code fences
  let cleaned = text.replace(/^```(?:json)?\s*/gm, "").replace(/```\s*$/gm, "");

  // Find first anchor and last matching close
  const close = anchor === "{" ? "}" : "]";
  const start = cleaned.indexOf(anchor);
  const end = cleaned.lastIndexOf(close);

  if (start === -1) return cleaned.trim();

  if (end === -1 || end <= start) {
    // Truncated output — attempt salvage
    let truncated = cleaned.slice(start);
    if (anchor === "[") {
      // Find last complete object in the array
      const lastObj = truncated.lastIndexOf("}");
      if (lastObj > 0) return truncated.slice(0, lastObj + 1) + "]";
    } else {
      // Strip trailing incomplete key-value, close the object
      const lastQuote = truncated.lastIndexOf('"');
      const lastColon = truncated.lastIndexOf(":");
      if (lastColon > lastQuote) truncated = truncated.slice(0, lastQuote + 1);
      return truncated + "}";
    }
    return cleaned.trim();
  }

  return cleaned.slice(start, end + 1);
}

// --- Seed Handler ---

export const crucibleSeedHandler: GenerationHandlers<CrucibleSeedTarget> = {
  streaming(): void {
    // No-op — JSON accumulates silently, no UI streaming for structured output
  },

  async completion(ctx: CompletionContext<CrucibleSeedTarget>): Promise<void> {
    if (!ctx.generationSucceeded || !ctx.accumulatedText) return;

    try {
      const json = repairJSON(ctx.accumulatedText, "{");
      const parsed = JSON.parse(json) as {
        content?: string;
      };

      if (!parsed.content) {
        api.v1.log("[crucible] Seed parse: missing content");
        return;
      }

      const node: CrucibleNode = {
        id: api.v1.uuid(),
        kind: "intent",
        origin: "solver",
        status: "pending",
        round: 0,
        content: String(parsed.content),
        serves: [],
        stale: false,
      };

      ctx.dispatch(crucibleSeeded({ node }));
    } catch (e) {
      api.v1.log("[crucible] Seed JSON parse failed:", e);
    }
  },
};

// --- Expand Handler ---

export const crucibleExpandHandler: GenerationHandlers<CrucibleExpandTarget> = {
  streaming(): void {
    // No-op — JSON accumulates silently
  },

  async completion(
    ctx: CompletionContext<CrucibleExpandTarget>,
  ): Promise<void> {
    if (!ctx.generationSucceeded || !ctx.accumulatedText) return;

    try {
      const json = repairJSON(ctx.accumulatedText, "[");
      const parsed = JSON.parse(json) as Array<{
        kind?: string;
        content?: string;
        serves?: string[];
        nudge?: boolean;
      }>;

      if (!Array.isArray(parsed) || parsed.length === 0) {
        api.v1.log("[crucible] Expand parse: empty or non-array result");
        return;
      }

      const state = ctx.getState();
      const existingIds = new Set(state.crucible.nodes.map((n) => n.id));
      const round = ctx.target.round;

      const nodes: CrucibleNode[] = [];
      for (const element of parsed) {
        // Resolve kind — map "nudge" to "situation" with nudge origin
        let resolvedKind = String(element.kind || "");
        let origin: CrucibleNode["origin"] = element.nudge ? "nudge" : "solver";
        if (resolvedKind === "nudge") {
          origin = "nudge";
          resolvedKind = "situation";
        }

        if (!ALLOWED_KINDS.has(resolvedKind)) {
          api.v1.log(`[crucible] Expand: skipping invalid kind "${resolvedKind}"`);
          continue;
        }

        if (!element.content) {
          api.v1.log("[crucible] Expand: skipping node missing content");
          continue;
        }

        // Validate serves IDs exist in current nodes
        const serves = (element.serves || []).filter((id) =>
          existingIds.has(String(id)),
        );

        nodes.push({
          id: api.v1.uuid(),
          kind: resolvedKind as CrucibleNodeKind,
          origin,
          status: "pending",
          round,
          content: String(element.content),
          serves,
          stale: false,
        });
      }

      if (nodes.length > 0) {
        ctx.dispatch(nodesAdded({ nodes }));
        ctx.dispatch(roundAdvanced());
      }
    } catch (e) {
      api.v1.log("[crucible] Expand JSON parse failed:", e);
    }
  },
};
