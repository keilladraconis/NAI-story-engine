/**
 * Crucible Strategy — Factory functions for Crucible goals and web-solver generations.
 *
 * v3: Web-based narrative solver. GLM sees the entire web and picks its own operations.
 */

import {
  RootState,
  GenerationStrategy,
  CrucibleNode,
  CrucibleEdge,
  CrucibleNodeKind,
} from "../store/types";
import { MessageFactory } from "nai-gen-x";
import { buildStoryEnginePrefix } from "./context-builder";

// --- Short ID prefixes per kind ---

const KIND_PREFIX: Record<CrucibleNodeKind, string> = {
  goal: "G",
  character: "C",
  faction: "F",
  location: "L",
  system: "S",
  situation: "D",
  beat: "B",
  opener: "O",
};

export const ARC_KINDS = new Set<CrucibleNodeKind>(["goal", "opener", "beat"]);
export const WORLD_KINDS = new Set<CrucibleNodeKind>(["character", "faction", "location", "system", "situation"]);

const ARC_ORDER: CrucibleNodeKind[] = ["goal", "beat", "opener"];
const WORLD_ORDER: CrucibleNodeKind[] = ["character", "faction", "location", "system", "situation"];

const KIND_ORDER: CrucibleNodeKind[] = [...ARC_ORDER, ...WORLD_ORDER];

const KIND_LABELS: Record<CrucibleNodeKind, string> = {
  goal: "GOALS",
  character: "CHARACTERS",
  faction: "FACTIONS",
  location: "LOCATIONS",
  system: "SYSTEMS",
  situation: "SITUATIONS",
  beat: "BEATS",
  opener: "OPENERS",
};

/**
 * Format the narrative web for the solve prompt.
 * Partitions nodes into arc (narrative chain) and world (supporting artifacts),
 * assigns short IDs (G1, C1, etc.), formats edges by category.
 * Returns the formatted string and a mapping of shortId → UUID.
 */
export function formatWeb(
  nodes: CrucibleNode[],
  edges: CrucibleEdge[],
): { formatted: string; idMap: Map<string, string> } {
  const idMap = new Map<string, string>(); // shortId → uuid
  const reverseMap = new Map<string, string>(); // uuid → shortId
  const lines: string[] = [];

  // Assign short IDs across all nodes (consistent ordering)
  const kindCounters: Record<string, number> = {};
  for (const kind of KIND_ORDER) {
    for (const node of nodes.filter((n) => n.kind === kind)) {
      const prefix = KIND_PREFIX[kind];
      const count = (kindCounters[prefix] || 0) + 1;
      kindCounters[prefix] = count;
      const shortId = `${prefix}${count}`;
      idMap.set(shortId, node.id);
      reverseMap.set(node.id, shortId);
    }
  }

  const formatNode = (node: CrucibleNode): string => {
    const shortId = reverseMap.get(node.id)!;
    const marker =
      node.status === "favorited" || node.status === "edited" ? " \u2605" :
      node.status === "disfavored" ? " \u2717" : "";
    return `  [${shortId}]${marker} ${node.content}`;
  };

  // Arc nodes section
  lines.push("ARC NODES (narrative chain \u2014 opener \u2192 beat \u2192 goal):");
  for (const kind of ARC_ORDER) {
    const kindNodes = nodes.filter((n) => n.kind === kind);
    if (kindNodes.length === 0) continue;
    lines.push(`  ${KIND_LABELS[kind]}:`);
    for (const node of kindNodes) {
      lines.push(`  ${formatNode(node)}`);
    }
  }

  // World nodes section
  const hasWorld = nodes.some((n) => WORLD_KINDS.has(n.kind));
  if (hasWorld) {
    lines.push("WORLD NODES (supporting cast & setting):");
    for (const kind of WORLD_ORDER) {
      const kindNodes = nodes.filter((n) => n.kind === kind);
      if (kindNodes.length === 0) continue;
      lines.push(`  ${KIND_LABELS[kind]}:`);
      for (const node of kindNodes) {
        lines.push(`  ${formatNode(node)}`);
      }
    }
  }

  // Partition edges
  const arcEdges: string[] = [];
  const supportEdges: string[] = [];

  for (const edge of edges) {
    const sourceShort = reverseMap.get(edge.source);
    const targetShort = reverseMap.get(edge.target);
    if (!sourceShort || !targetShort) continue;

    const sourceNode = nodes.find((n) => n.id === edge.source);
    const targetNode = nodes.find((n) => n.id === edge.target);
    const edgeStr = `  ${sourceShort} --${edge.type}--> ${targetShort}`;

    if (sourceNode && targetNode && ARC_KINDS.has(sourceNode.kind) && ARC_KINDS.has(targetNode.kind)) {
      arcEdges.push(edgeStr);
    } else {
      supportEdges.push(edgeStr);
    }
  }

  if (arcEdges.length > 0) {
    lines.push("ARC EDGES:");
    lines.push(...arcEdges);
  }
  if (supportEdges.length > 0) {
    lines.push("SUPPORT EDGES (world \u2194 arc):");
    lines.push(...supportEdges);
  }

  // Diversity report
  const presentKinds = new Set(nodes.map((n) => n.kind));
  const underRepresented = KIND_ORDER.filter(
    (k) => k !== "goal" && !presentKinds.has(k),
  );
  if (underRepresented.length > 0) {
    lines.push(`UNDER-REPRESENTED: ${underRepresented.join(", ")}`);
  }

  return { formatted: lines.join("\n"), idMap };
}

// --- Factory Functions ---

/**
 * Creates a message factory for Crucible goal generation.
 * GLM extracts intent + strategy + generates epic goals in one call.
 */
export const createCrucibleGoalsFactory = (
  getState: () => RootState,
): MessageFactory => {
  return async () => {
    const goalsPrompt = String(
      (await api.v1.config.get("crucible_goals_prompt")) || "",
    );

    const prefix = await buildStoryEnginePrefix(getState);

    const messages: Message[] = [
      ...prefix,
      {
        role: "system",
        content: goalsPrompt,
      },
      { role: "assistant", content: '{"intent":"' },
    ];

    return {
      messages,
      params: {
        model: "glm-4-6",
        max_tokens: 1024,
        temperature: 0.9,
        min_p: 0.05,
      },
    };
  };
};

/**
 * Creates a message factory for Crucible web-solver.
 * GLM sees the full web and chooses an operation (add/update/connect).
 */
export const createCrucibleSolveFactory = (
  getState: () => RootState,
): MessageFactory => {
  return async () => {
    const state = getState();

    const solvePrompt = String(
      (await api.v1.config.get("crucible_solve_prompt")) || "",
    );

    const { formatted } = formatWeb(state.crucible.nodes, state.crucible.edges);

    const contextParts: string[] = [];
    if (state.crucible.intent) {
      contextParts.push(`[INTENT]\n${state.crucible.intent}`);
    }
    contextParts.push(`[CURRENT WEB]\n${formatted}`);

    // Append solver feedback if the last operation was rejected
    if (state.crucible.solverFeedback) {
      contextParts.push(`[SOLVER FEEDBACK]\n${state.crucible.solverFeedback}`);
    }

    const prefix = await buildStoryEnginePrefix(getState);

    const messages: Message[] = [
      ...prefix,
      {
        role: "system",
        content: `${solvePrompt}\n\n${contextParts.join("\n\n")}`,
      },
      { role: "assistant", content: "{" },
    ];

    return {
      messages,
      params: {
        model: "glm-4-6",
        max_tokens: 384,
        temperature: 0.75,
        min_p: 0.05,
      },
    };
  };
};

/**
 * Creates a message factory for Crucible intent (re)generation.
 * GLM derives intent, strategy, and tags from brainstorm + story state.
 */
export const createCrucibleIntentFactory = (
  getState: () => RootState,
): MessageFactory => {
  return async () => {
    const intentPrompt = String(
      (await api.v1.config.get("crucible_intent_prompt")) || "",
    );

    const prefix = await buildStoryEnginePrefix(getState);

    const messages: Message[] = [
      ...prefix,
      {
        role: "system",
        content: intentPrompt,
      },
      { role: "assistant", content: '{"intent":"' },
    ];

    return {
      messages,
      params: {
        model: "glm-4-6",
        max_tokens: 512,
        temperature: 0.8,
        min_p: 0.05,
      },
    };
  };
};

// --- Strategy Builders ---

/**
 * Builds a Crucible goals generation strategy.
 */
export const buildCrucibleGoalsStrategy = (
  getState: () => RootState,
): GenerationStrategy => {
  return {
    requestId: api.v1.uuid(),
    messageFactory: createCrucibleGoalsFactory(getState),
    target: { type: "crucibleGoals" },
    prefillBehavior: "keep",
    assistantPrefill: '{"intent":"',
  };
};

/**
 * Builds a Crucible intent generation strategy.
 */
export const buildCrucibleIntentStrategy = (
  getState: () => RootState,
): GenerationStrategy => {
  return {
    requestId: api.v1.uuid(),
    messageFactory: createCrucibleIntentFactory(getState),
    target: { type: "crucibleIntent" },
    prefillBehavior: "keep",
    assistantPrefill: '{"intent":"',
  };
};

/**
 * Builds a Crucible solve generation strategy.
 */
export const buildCrucibleSolveStrategy = (
  getState: () => RootState,
): GenerationStrategy => {
  return {
    requestId: api.v1.uuid(),
    messageFactory: createCrucibleSolveFactory(getState),
    target: { type: "crucibleSolve" },
    prefillBehavior: "keep",
    assistantPrefill: "{",
  };
};
