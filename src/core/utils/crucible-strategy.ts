/**
 * Crucible Strategy — Factory functions for Crucible seed and expand generations.
 *
 * Follows the same unified-prefix pattern as lorebook-strategy.ts and context-builder.ts.
 * Both strategies share buildStoryEnginePrefix() for cache efficiency.
 */

import {
  RootState,
  GenerationStrategy,
  CrucibleNode,
  CrucibleStrategy,
  CrucibleNodeKind,
} from "../store/types";
import { MessageFactory } from "nai-gen-x";
import { buildStoryEnginePrefix } from "./context-builder";

// --- Strategy Bias Instructions ---

const STRATEGY_BIAS: Record<Exclude<CrucibleStrategy, "custom">, string> = {
  "character-driven":
    "Prioritize characters with conflicting motivations. Every proposed character should have a relationship tension with at least one existing character. Propose situations that force character choices.",
  "faction-conflict":
    "Prioritize factions and power structures. Characters should be members or opponents of factions. Locations should be contested or strategic. Situations should involve faction interests colliding.",
  "mystery-revelation":
    "Prioritize secrets, hidden information, and asymmetric knowledge. Characters should have something to hide. Locations should contain clues. Situations should involve information being revealed or suppressed.",
  exploration:
    "Prioritize locations, world systems, and frontiers. Characters should be discoverers or gatekeepers. Situations should involve the unknown or the boundary between known and unknown.",
  "slice-of-life":
    "Prioritize mundane but meaningful details — daily routines, community bonds, small personal stakes. Characters should have domestic concerns alongside larger tensions. Locations should feel lived-in.",
};

/**
 * Returns the strategy-specific bias paragraph for the given strategy.
 * For "custom", fetches the user's free-text instruction from storyStorage.
 */
async function getStrategyBias(
  strategy: CrucibleStrategy | null,
): Promise<string> {
  if (!strategy) return "";

  if (strategy === "custom") {
    const custom = String(
      (await api.v1.storyStorage.get("kse-crucible-custom-strategy")) || "",
    );
    return custom || "";
  }

  return STRATEGY_BIAS[strategy] || "";
}

// --- Node Kind labels for grouping ---

const KIND_LABELS: Record<CrucibleNodeKind, string> = {
  intent: "INTENT",
  beat: "BEATS",
  character: "CHARACTERS",
  faction: "FACTIONS",
  location: "LOCATIONS",
  system: "SYSTEMS",
  situation: "SITUATIONS",
  opener: "OPENERS",
};

/**
 * Groups accepted/edited nodes by kind and formats as labeled sections.
 * Only includes nodes with status "accepted" or "edited".
 */
function formatAcceptedNodes(nodes: CrucibleNode[]): string {
  const accepted = nodes.filter(
    (n) => n.status === "accepted" || n.status === "edited",
  );

  if (accepted.length === 0) return "";

  const grouped: Partial<Record<CrucibleNodeKind, CrucibleNode[]>> = {};
  for (const node of accepted) {
    if (!grouped[node.kind]) grouped[node.kind] = [];
    grouped[node.kind]!.push(node);
  }

  const sections: string[] = [];
  for (const kind of Object.keys(KIND_LABELS) as CrucibleNodeKind[]) {
    const group = grouped[kind];
    if (!group || group.length === 0) continue;

    const label = KIND_LABELS[kind];
    const items = group
      .map((n) => `- [${n.id}] ${n.summary}\n  ${n.content}`)
      .join("\n");
    sections.push(`[${label}]\n${items}`);
  }

  return sections.join("\n\n");
}

// --- Factory Functions ---

/**
 * Creates a message factory for Crucible seed extraction.
 * Extracts the core intent from brainstorm as a JSON { content, summary } object.
 */
export const createCrucibleSeedFactory = (
  getState: () => RootState,
): MessageFactory => {
  return async () => {
    const state = getState();

    const seedPrompt = String(
      (await api.v1.config.get("crucible_seed_prompt")) || "",
    );

    const bias = await getStrategyBias(state.crucible.strategy);
    const strategyInstruction = bias
      ? `\n\n[STRATEGY: ${state.crucible.strategy}]\n${bias}`
      : "";

    const prefix = await buildStoryEnginePrefix(getState);

    const messages: Message[] = [
      ...prefix,
      {
        role: "system",
        content: `${seedPrompt}${strategyInstruction}`,
      },
      { role: "assistant", content: "{" },
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

/**
 * Creates a message factory for Crucible expansion rounds.
 * Proposes 3-5 new nodes that serve existing accepted nodes.
 */
export const createCrucibleExpandFactory = (
  getState: () => RootState,
): MessageFactory => {
  return async () => {
    const state = getState();

    const expandPrompt = String(
      (await api.v1.config.get("crucible_expand_prompt")) || "",
    );

    // Build node context
    const intentNode = state.crucible.nodes.find((n) => n.kind === "intent");
    const intentSection = intentNode
      ? `[INTENT]\n${intentNode.content}`
      : "";

    const acceptedSection = formatAcceptedNodes(
      state.crucible.nodes.filter((n) => n.kind !== "intent"),
    );

    const bias = await getStrategyBias(state.crucible.strategy);
    const strategyInstruction = bias
      ? `[STRATEGY: ${state.crucible.strategy}]\n${bias}`
      : "";

    const nudgeInstruction =
      "Additionally, propose ONE \"nudge\" — a surprising element that makes the world more interesting. Mark it with \"nudge\": true. The user can always reject it.";

    // Assemble the crucible-specific context
    const contextParts: string[] = [];
    if (intentSection) contextParts.push(intentSection);
    if (acceptedSection) contextParts.push(`[ACCEPTED NODES]\n${acceptedSection}`);
    if (strategyInstruction) contextParts.push(strategyInstruction);
    contextParts.push(nudgeInstruction);

    const prefix = await buildStoryEnginePrefix(getState);

    const messages: Message[] = [
      ...prefix,
      {
        role: "system",
        content: `${expandPrompt}\n\n${contextParts.join("\n\n")}`,
      },
      { role: "assistant", content: "[" },
    ];

    return {
      messages,
      params: {
        model: "glm-4-6",
        max_tokens: 1024,
        temperature: 0.85,
        min_p: 0.05,
      },
    };
  };
};

// --- Strategy Builders ---

/**
 * Builds a Crucible seed generation strategy.
 */
export const buildCrucibleSeedStrategy = (
  getState: () => RootState,
): GenerationStrategy => {
  return {
    requestId: api.v1.uuid(),
    messageFactory: createCrucibleSeedFactory(getState),
    target: { type: "crucibleSeed" },
    prefillBehavior: "keep",
    assistantPrefill: "{",
  };
};

/**
 * Builds a Crucible expand generation strategy.
 */
export const buildCrucibleExpandStrategy = (
  getState: () => RootState,
): GenerationStrategy => {
  const state = getState();
  return {
    requestId: api.v1.uuid(),
    messageFactory: createCrucibleExpandFactory(getState),
    target: { type: "crucibleExpand", round: state.crucible.currentRound },
    prefillBehavior: "keep",
    assistantPrefill: "[",
  };
};
