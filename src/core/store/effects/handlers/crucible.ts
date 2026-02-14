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
import { intentSet, nodesAdded, nodeUpdated, edgeAdded, solverFeedbackSet, strategyEdited, crucibleAutoSolveStopped } from "../../index";
import { formatWeb, ARC_KINDS } from "../../../utils/crucible-strategy";

// --- Types for crucible targets ---

type CrucibleGoalsTarget = { type: "crucibleGoals" };
type CrucibleIntentTarget = { type: "crucibleIntent" };
type CrucibleSolveTarget = { type: "crucibleSolve" };

// --- Allowed node kinds for validation ---

const ALLOWED_KINDS = new Set<string>([
  "goal", "beat", "character", "faction",
  "location", "system", "situation", "opener",
]);

const ALLOWED_EDGE_TYPES = new Set<string>([
  "requires", "involves", "opposes", "located_at",
]);

/** Max edges per node — prevents nexus nodes that connect to everything */
const MAX_EDGES_PER_NODE = 4;

/**
 * Check if adding an edge source→target would create a cycle among arc nodes.
 * Uses BFS: if target can already reach source via existing arc edges, adding
 * source→target closes a loop.
 */
function wouldCreateArcCycle(
  sourceUuid: string,
  targetUuid: string,
  nodes: CrucibleNode[],
  edges: CrucibleEdge[],
): boolean {
  const arcNodeIds = new Set(nodes.filter((n) => ARC_KINDS.has(n.kind)).map((n) => n.id));
  if (!arcNodeIds.has(sourceUuid) || !arcNodeIds.has(targetUuid)) return false;

  // BFS from target — can it reach source via existing arc-only edges?
  const visited = new Set<string>();
  const queue = [targetUuid];
  visited.add(targetUuid);

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === sourceUuid) return true;
    for (const edge of edges) {
      // Follow edges in both directions (undirected for reachability)
      const neighbor =
        edge.source === current ? edge.target :
        edge.target === current ? edge.source : null;
      if (neighbor && arcNodeIds.has(neighbor) && !visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }

  return false;
}

/**
 * Count existing edges for a node (as source or target).
 */
function edgeCount(nodeId: string, edges: CrucibleEdge[]): number {
  let count = 0;
  for (const edge of edges) {
    if (edge.source === nodeId || edge.target === nodeId) count++;
  }
  return count;
}

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
        const strategyLabel = parsed.strategy ? String(parsed.strategy) : undefined;
        ctx.dispatch(intentSet({
          intent: String(parsed.intent),
          strategyLabel,
        }));
        if (strategyLabel) {
          api.v1.storyStorage.set("cr-strategy-value", strategyLabel);
        }
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

// --- Intent Handler ---

export const crucibleIntentHandler: GenerationHandlers<CrucibleIntentTarget> = {
  streaming(): void {
    // No-op — JSON accumulates silently
  },

  async completion(ctx: CompletionContext<CrucibleIntentTarget>): Promise<void> {
    if (!ctx.generationSucceeded || !ctx.accumulatedText) return;

    try {
      const json = repairJSON(ctx.accumulatedText);
      const parsed = JSON.parse(json) as {
        intent?: string;
        strategy?: string;
        tags?: string[];
      };

      if (parsed.intent) {
        // Build intent text with tags if present
        let intentText = String(parsed.intent);
        if (Array.isArray(parsed.tags) && parsed.tags.length > 0) {
          const tagLine = parsed.tags.map((t) => String(t)).join(", ");
          intentText += `\nTags: ${tagLine}`;
        }

        // Always overwrite — user explicitly requested (re)generation
        ctx.dispatch(intentSet({ intent: intentText }));
      }

      if (parsed.strategy) {
        const strategyValue = String(parsed.strategy);
        ctx.dispatch(strategyEdited({ strategy: strategyValue }));
        api.v1.storyStorage.set("cr-strategy-value", strategyValue);
      }
    } catch (e) {
      api.v1.log("[crucible] Intent JSON parse failed:", e);
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
        let goalConnectionsRejected = 0;
        if (Array.isArray(parsed.connect)) {
          for (const conn of parsed.connect) {
            if (!conn.id || !conn.type) continue;
            const targetUuid = idMap.get(String(conn.id));
            if (!targetUuid) continue;
            if (!ALLOWED_EDGE_TYPES.has(String(conn.type))) continue;

            // Reject opener → goal connections (openers are inciting incidents, not endpoints)
            if (kind === "opener" && state.crucible.nodes.some(
              (n) => n.id === targetUuid && n.kind === "goal",
            )) {
              api.v1.log(`[crucible] Solve: rejected opener→goal connection`);
              goalConnectionsRejected++;
              continue;
            }

            // Skip if target node already has too many connections
            if (edgeCount(targetUuid, state.crucible.edges) >= MAX_EDGES_PER_NODE) {
              api.v1.log(`[crucible] Solve: skipped edge to saturated node`);
              continue;
            }

            // Skip if this arc edge would create a cycle
            if (wouldCreateArcCycle(nodeId, targetUuid, state.crucible.nodes, state.crucible.edges)) {
              api.v1.log(`[crucible] Solve: skipped arc cycle edge`);
              continue;
            }

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
          const feedback = goalConnectionsRejected > 0
            ? `Rejected: openers cannot connect to goals. Goals are endpoints. ` +
              `Connect to beats or world nodes instead.`
            : `Rejected: ${kind} add had no valid connections. Every non-goal node MUST include a "connect" array linking to at least one existing node.`;
          ctx.dispatch(solverFeedbackSet({ feedback }));
          return;
        }

        // Arc nodes must connect to at least one other arc node.
        // A situation connected only to characters/locations is disconnected from
        // the narrative chain — it needs a link to a goal, beat, or opener.
        const arcKind = kind as CrucibleNodeKind;
        if (ARC_KINDS.has(arcKind) && kind !== "goal") {
          const hasArcConnection = edges.some((e) => {
            const targetNode = state.crucible.nodes.find((n) => n.id === e.target);
            return targetNode && ARC_KINDS.has(targetNode.kind);
          });
          if (!hasArcConnection) {
            api.v1.log(`[crucible] Solve add: rejected arc-disconnected ${kind} "${String(parsed.content).slice(0, 40)}"`);
            ctx.dispatch(solverFeedbackSet({
              feedback: `Rejected: ${kind} has no connection to another arc node (goal, beat, opener). ` +
                `Arc nodes must connect to the narrative chain, not just to world nodes. ` +
                `Add a connection to a beat or (for beats) a goal.`,
            }));
            return;
          }
        }

        // Clear feedback on success
        ctx.dispatch(solverFeedbackSet({ feedback: null }));
        ctx.dispatch(nodesAdded({ nodes: [node], edges: edges.length > 0 ? edges : undefined }));

        // Stop auto-solve when an opener is generated (narrative is complete enough)
        if (kind === "opener") {
          ctx.dispatch(crucibleAutoSolveStopped());
        }
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

        // Reject opener ↔ goal connections (openers start the story, goals end it)
        const sourceNode = state.crucible.nodes.find((n) => n.id === sourceUuid);
        const targetNode = state.crucible.nodes.find((n) => n.id === targetUuid);
        if (
          sourceNode?.kind === "opener" && targetNode?.kind === "goal" ||
          targetNode?.kind === "opener" && sourceNode?.kind === "goal"
        ) {
          api.v1.log(`[crucible] Solve connect: rejected opener↔goal edge`);
          ctx.dispatch(solverFeedbackSet({
            feedback: "Rejected: openers cannot connect directly to goals. Goals are endpoints.",
          }));
          return;
        }

        // Reject if either node is saturated
        if (edgeCount(sourceUuid, state.crucible.edges) >= MAX_EDGES_PER_NODE ||
            edgeCount(targetUuid, state.crucible.edges) >= MAX_EDGES_PER_NODE) {
          api.v1.log(`[crucible] Solve connect: rejected — node at max connections (${MAX_EDGES_PER_NODE})`);
          ctx.dispatch(solverFeedbackSet({
            feedback: `Rejected: one of the nodes already has ${MAX_EDGES_PER_NODE} connections. Connect to a less-connected node instead.`,
          }));
          return;
        }

        // Reject arc cycles
        if (wouldCreateArcCycle(sourceUuid, targetUuid, state.crucible.nodes, state.crucible.edges)) {
          api.v1.log(`[crucible] Solve connect: rejected — would create arc cycle`);
          ctx.dispatch(solverFeedbackSet({
            feedback: "Rejected: this connection would create a cycle in the arc chain. Arc nodes must form a directed chain toward goals, not loops.",
          }));
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
