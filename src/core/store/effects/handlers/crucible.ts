import {
  GenerationHandlers,
  CompletionContext,
} from "../generation-handlers";
import {
  CrucibleNode,
  CrucibleEdge,
  CrucibleNodeKind,
  CrucibleEdgeType,
} from "../../types";
import { intentSet, nodesAdded, nodeUpdated, edgeAdded, solverFeedbackSet } from "../../index";
import { formatWeb } from "../../../utils/crucible-strategy";

// --- Types for crucible targets ---

type CrucibleGoalsTarget = { type: "crucibleGoals" };
type CrucibleSolveTarget = { type: "crucibleSolve" };

// --- Allowed node kinds for validation ---

const ALLOWED_KINDS = new Set<string>([
  "goal", "beat", "character", "faction",
  "location", "system", "situation", "opener",
]);

const ALLOWED_EDGE_TYPES = new Set<string>([
  "requires", "involves", "opposes", "located_at",
]);

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
        intent?: string;
        strategy?: string;
        goals?: Array<{ content?: string }>;
      };

      // Extract intent if present — only set if no manual intent exists
      if (parsed.intent && !ctx.getState().crucible.intent) {
        ctx.dispatch(intentSet({
          intent: String(parsed.intent),
          strategyLabel: parsed.strategy ? String(parsed.strategy) : undefined,
        }));
      }

      const goalsArray = parsed.goals;
      if (!Array.isArray(goalsArray) || goalsArray.length === 0) {
        api.v1.log("[crucible] Goals parse: missing goals array. Raw:", ctx.accumulatedText.slice(0, 500));
        return;
      }

      const goals: CrucibleNode[] = [];
      for (const element of goalsArray) {
        if (!element.content) continue;

        goals.push({
          id: api.v1.uuid(),
          kind: "goal",
          origin: "solver",
          status: "pending",
          content: String(element.content),
          stale: false,
        });
      }

      if (goals.length > 0) {
        ctx.dispatch(nodesAdded({ nodes: goals }));
      }
    } catch (e) {
      api.v1.log("[crucible] Goals JSON parse failed:", e);
      api.v1.log("[crucible] Raw text:", ctx.accumulatedText.slice(0, 500));
    }
  },
};

// --- Solve Handler ---

export const crucibleSolveHandler: GenerationHandlers<CrucibleSolveTarget> = {
  streaming(): void {
    // No-op — JSON accumulates silently
  },

  async completion(ctx: CompletionContext<CrucibleSolveTarget>): Promise<void> {
    if (!ctx.generationSucceeded || !ctx.accumulatedText) return;

    try {
      const json = repairJSON(ctx.accumulatedText);
      const parsed = JSON.parse(json) as {
        op?: string;
        kind?: string;
        content?: string;
        connect?: Array<{ id?: string; type?: string }>;
        id?: string;
        source?: string;
        target?: string;
        type?: string;
      };

      const op = String(parsed.op || "add");
      const state = ctx.getState();
      const { idMap } = formatWeb(state.crucible.nodes, state.crucible.edges);

      if (op === "add") {
        const kind = String(parsed.kind || "");
        if (!ALLOWED_KINDS.has(kind)) {
          api.v1.log(`[crucible] Solve add: invalid kind "${kind}"`);
          ctx.dispatch(solverFeedbackSet({
            feedback: `Rejected: invalid kind "${kind}". Use: ${[...ALLOWED_KINDS].join(", ")}`,
          }));
          return;
        }
        if (!parsed.content) {
          api.v1.log("[crucible] Solve add: missing content");
          ctx.dispatch(solverFeedbackSet({ feedback: "Rejected: add op missing content." }));
          return;
        }

        const nodeId = api.v1.uuid();
        const node: CrucibleNode = {
          id: nodeId,
          kind: kind as CrucibleNodeKind,
          origin: "solver",
          status: "pending",
          content: String(parsed.content),
          stale: false,
        };

        // Parse connections
        const edges: CrucibleEdge[] = [];
        if (Array.isArray(parsed.connect)) {
          for (const conn of parsed.connect) {
            if (!conn.id || !conn.type) continue;
            const targetUuid = idMap.get(String(conn.id));
            if (!targetUuid) continue;
            if (!ALLOWED_EDGE_TYPES.has(String(conn.type))) continue;
            edges.push({
              source: nodeId,
              target: targetUuid,
              type: String(conn.type) as CrucibleEdgeType,
            });
          }
        }

        // Reject orphan non-goal nodes — only goals may float
        if (kind !== "goal" && edges.length === 0) {
          api.v1.log(`[crucible] Solve add: rejected orphan ${kind} "${String(parsed.content).slice(0, 40)}"`);
          ctx.dispatch(solverFeedbackSet({
            feedback: `Rejected: ${kind} add had no valid connections. Every non-goal node MUST include a "connect" array linking to at least one existing node.`,
          }));
          return;
        }

        // Clear feedback on success
        ctx.dispatch(solverFeedbackSet({ feedback: null }));
        ctx.dispatch(nodesAdded({ nodes: [node], edges: edges.length > 0 ? edges : undefined }));
      } else if (op === "update") {
        const shortId = String(parsed.id || "");
        const uuid = idMap.get(shortId);
        if (!uuid) {
          api.v1.log(`[crucible] Solve update: unknown ID "${shortId}"`);
          return;
        }
        if (!parsed.content) {
          api.v1.log("[crucible] Solve update: missing content");
          return;
        }
        ctx.dispatch(solverFeedbackSet({ feedback: null }));
        ctx.dispatch(nodeUpdated({ id: uuid, content: String(parsed.content) }));
      } else if (op === "connect") {
        const sourceId = String(parsed.source || "");
        const targetId = String(parsed.target || "");
        const edgeType = String(parsed.type || "");
        const sourceUuid = idMap.get(sourceId);
        const targetUuid = idMap.get(targetId);
        if (!sourceUuid || !targetUuid) {
          api.v1.log(`[crucible] Solve connect: unknown IDs "${sourceId}" or "${targetId}"`);
          return;
        }
        if (!ALLOWED_EDGE_TYPES.has(edgeType)) {
          api.v1.log(`[crucible] Solve connect: invalid edge type "${edgeType}"`);
          return;
        }
        ctx.dispatch(solverFeedbackSet({ feedback: null }));
        ctx.dispatch(edgeAdded({
          edge: { source: sourceUuid, target: targetUuid, type: edgeType as CrucibleEdgeType },
        }));
      } else {
        api.v1.log(`[crucible] Solve: unknown op "${op}"`);
      }
    } catch (e) {
      api.v1.log("[crucible] Solve JSON parse failed:", e);
    }
  },
};
