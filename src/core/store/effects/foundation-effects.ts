/**
 * Foundation Effects — Generation for Narrative Foundation fields.
 *
 * Handles shapeGenerationRequested, intentGenerationRequested, worldStateGenerationRequested
 * by building a context-aware prompt and submitting to the generation engine.
 *
 * All factories use buildStoryEnginePrefix for caching and brainstorm/canon/setting inclusion.
 * Foundation section is excluded from prefix when generating its own fields to prevent
 * self-referential bias (e.g. generating shape while shape is already in context).
 */

import { Store, matchesAction } from "nai-store";
import { RootState, AppDispatch, GenerationStrategy } from "../types";
import {
  shapeGenerationRequested,
  intentGenerationRequested,
  worldStateGenerationRequested,
  generationSubmitted,
  requestQueued,
} from "../index";
import { MessageFactory } from "nai-gen-x";
import { buildStoryEnginePrefix } from "../../utils/context-builder";

// ─── Factories ────────────────────────────────────────────────────────────────

/**
 * Shape: reads brainstorm + setting + canon, excludes foundation entirely.
 * "SHAPE: " assistant anchor constrains output format without appearing in stored text.
 */
const createShapeFactory = (getState: () => RootState): MessageFactory => async () => {
  const shapePrompt = String((await api.v1.config.get("crucible_shape_prompt")) || "");

  const prefix = await buildStoryEnginePrefix(getState, {
    excludeSections: ["foundation"],
  });

  const messages: Message[] = [
    ...prefix,
    { role: "system" as const, content: shapePrompt },
    { role: "assistant" as const, content: "SHAPE: " },
  ];

  return { messages, params: { model: "glm-4-6", max_tokens: 128, temperature: 0.7, min_p: 0.05, stop: ["</think>"] } };
};

/**
 * Intent: reads brainstorm + setting + canon, excludes foundation.
 * Injects shape separately if present — shape informs direction without making intent circular.
 */
const createIntentFactory = (getState: () => RootState): MessageFactory => async () => {
  const intentPrompt = String((await api.v1.config.get("crucible_intent_prompt")) || "");

  const prefix = await buildStoryEnginePrefix(getState, {
    excludeSections: ["foundation"],
  });

  const messages: Message[] = [...prefix];

  const shape = getState().foundation.shape;
  if (shape) {
    messages.push({
      role: "system" as const,
      content: `[NARRATIVE SHAPE]\n${shape}`,
    });
  }

  messages.push({ role: "system" as const, content: intentPrompt });

  return { messages, params: { model: "glm-4-6", max_tokens: 1024, temperature: 1.0, min_p: 0.05, stop: ["</think>"] } };
};

/**
 * WorldState: reads brainstorm + setting + canon, excludes foundation.
 * Injects shape + intent separately so they anchor the world state without being repeated.
 */
const createWorldStateFactory = (getState: () => RootState): MessageFactory => async () => {
  const worldStatePrompt = String((await api.v1.config.get("foundation_world_state_prompt")) || "");

  const prefix = await buildStoryEnginePrefix(getState, {
    excludeSections: ["foundation"],
  });

  const messages: Message[] = [...prefix];

  const { shape, intent } = getState().foundation;
  const anchors: string[] = [];
  if (shape) anchors.push(`Shape: ${shape}`);
  if (intent) anchors.push(`Intent: ${intent}`);
  if (anchors.length > 0) {
    messages.push({ role: "system" as const, content: anchors.join("\n") });
  }

  messages.push({ role: "system" as const, content: worldStatePrompt });

  return { messages, params: { model: "glm-4-6", max_tokens: 256, temperature: 0.85, min_p: 0.05, stop: ["</think>"] } };
};

// ─── Strategy builders ────────────────────────────────────────────────────────

function buildFoundationStrategy(
  getState: () => RootState,
  field: "shape" | "intent" | "worldState",
): GenerationStrategy {
  const factoryMap = {
    shape:      createShapeFactory,
    intent:     createIntentFactory,
    worldState: createWorldStateFactory,
  };

  return {
    requestId: api.v1.uuid(),
    messageFactory: factoryMap[field](getState),
    target: { type: "foundation", field },
    prefillBehavior: "trim",
  };
}

// ─── Effect registration ──────────────────────────────────────────────────────

export function registerFoundationEffects(
  subscribeEffect: Store<RootState>["subscribeEffect"],
  dispatch: AppDispatch,
  getState: () => RootState,
): void {
  subscribeEffect(matchesAction(shapeGenerationRequested), () => {
    const strategy = buildFoundationStrategy(getState, "shape");
    dispatch(requestQueued({ id: strategy.requestId, type: "foundation", targetId: "shape" }));
    dispatch(generationSubmitted(strategy));
  });

  subscribeEffect(matchesAction(intentGenerationRequested), () => {
    const strategy = buildFoundationStrategy(getState, "intent");
    dispatch(requestQueued({ id: strategy.requestId, type: "foundation", targetId: "intent" }));
    dispatch(generationSubmitted(strategy));
  });

  subscribeEffect(matchesAction(worldStateGenerationRequested), () => {
    const strategy = buildFoundationStrategy(getState, "worldState");
    dispatch(requestQueued({ id: strategy.requestId, type: "foundation", targetId: "worldState" }));
    dispatch(generationSubmitted(strategy));
  });
}
