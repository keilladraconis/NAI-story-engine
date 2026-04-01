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
import { getModel } from "../../utils/config";
import {
  shapeGenerationRequested,
  intentGenerationRequested,
  worldStateGenerationRequested,
  attgGenerationRequested,
  styleGenerationRequested,
  tensionAdded,
  tensionGenerationRequested,
  generationSubmitted,
  requestQueued,
} from "../index";
import { MessageFactory } from "nai-gen-x";
import { buildStoryEnginePrefix } from "../../utils/context-builder";
import { STORAGE_KEYS } from "../../../ui/framework/ids";

// ─── Factories ────────────────────────────────────────────────────────────────

/**
 * Shape: reads brainstorm + setting + canon, excludes foundation entirely.
 * If the user has typed a name in the shape name input, it is injected as an
 * assistant prefill so the model only generates the structural description.
 * Otherwise the model invents both name and description freely.
 */
const createShapeFactory = (getState: () => RootState): MessageFactory => async () => {
  const shapePrompt = String((await api.v1.config.get("crucible_shape_prompt")) || "");
  const nameRaw = await api.v1.storyStorage.get(STORAGE_KEYS.FOUNDATION_SHAPE_NAME_UI);
  const prefillName = String(nameRaw || "").trim();

  const prefix = await buildStoryEnginePrefix(getState, {
    excludeSections: ["foundation"],
  });

  // If the user supplied a name, anchor the model to it; otherwise let it invent freely.
  const prefill = prefillName ? `SHAPE: ${prefillName}\n\n` : "SHAPE: ";

  const messages: Message[] = [
    ...prefix,
    { role: "system" as const, content: shapePrompt },
    { role: "assistant" as const, content: prefill },
  ];

  return { messages, params: { model: await getModel(), max_tokens: 128, temperature: 0.7, min_p: 0.05, stop: ["</think>"] } };
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
      content: `[NARRATIVE SHAPE]\n${shape.name}: ${shape.description}`,
    });
  }

  messages.push({ role: "system" as const, content: intentPrompt });

  return { messages, params: { model: await getModel(), max_tokens: 1024, temperature: 1.0, min_p: 0.05, stop: ["</think>"] } };
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
  if (shape) anchors.push(`Shape: ${shape.name}: ${shape.description}`);
  if (intent) anchors.push(`Intent: ${intent}`);
  if (anchors.length > 0) {
    messages.push({ role: "system" as const, content: anchors.join("\n") });
  }

  messages.push({ role: "system" as const, content: worldStatePrompt });

  return { messages, params: { model: await getModel(), max_tokens: 256, temperature: 0.85, min_p: 0.05, stop: ["</think>"] } };
};

/**
 * ATTG: reads foundation context (shape, intent, world state) and generates an ATTG block.
 */
const createAttgFactory = (getState: () => RootState): MessageFactory => async () => {
  const attgPrompt = String((await api.v1.config.get("attg_generate_prompt")) || "");

  const prefix = await buildStoryEnginePrefix(getState, { excludeSections: ["foundation"] });
  const messages: Message[] = [...prefix];

  const { shape, intent, worldState } = getState().foundation;
  const anchors: string[] = [];
  if (shape) anchors.push(`Shape: ${shape.name}: ${shape.description}`);
  if (intent) anchors.push(`Intent: ${intent}`);
  if (worldState) anchors.push(`World State: ${worldState}`);
  if (anchors.length > 0) {
    messages.push({ role: "system" as const, content: anchors.join("\n") });
  }

  messages.push({ role: "system" as const, content: attgPrompt });

  return { messages, params: { model: await getModel(), max_tokens: 64, temperature: 0.7, min_p: 0.05, stop: ["</think>"] } };
};

/**
 * Style: reads foundation context (shape, intent, world state) and generates a Style block.
 */
const createStyleFactory = (getState: () => RootState): MessageFactory => async () => {
  const stylePrompt = String((await api.v1.config.get("style_generate_prompt")) || "");

  const prefix = await buildStoryEnginePrefix(getState, { excludeSections: ["foundation"] });
  const messages: Message[] = [...prefix];

  const { shape, intent, worldState } = getState().foundation;
  const anchors: string[] = [];
  if (shape) anchors.push(`Shape: ${shape.name}: ${shape.description}`);
  if (intent) anchors.push(`Intent: ${intent}`);
  if (worldState) anchors.push(`World State: ${worldState}`);
  if (anchors.length > 0) {
    messages.push({ role: "system" as const, content: anchors.join("\n") });
  }

  messages.push({ role: "system" as const, content: stylePrompt });

  return { messages, params: { model: await getModel(), max_tokens: 128, temperature: 0.7, min_p: 0.05, stop: ["</think>"] } };
};

/**
 * Tension: reads full foundation context (shape, intent, world state, existing tensions).
 * Generates a single new tension as plain prose.
 */
const createTensionFactory = (getState: () => RootState, tensionId: string): MessageFactory => async () => {
  const tensionPrompt = String((await api.v1.config.get("crucible_tensions_prompt")) || "");

  const prefix = await buildStoryEnginePrefix(getState, {
    excludeSections: ["foundation"],
  });

  const messages: Message[] = [...prefix];

  const { shape, intent, worldState, tensions } = getState().foundation;
  const anchors: string[] = [];
  if (shape) anchors.push(`Shape: ${shape.name}: ${shape.description}`);
  if (intent) anchors.push(`Intent: ${intent}`);
  if (worldState) anchors.push(`World State: ${worldState}`);

  const existingTensions = tensions.filter((t) => !t.resolved && t.id !== tensionId && t.text);
  if (existingTensions.length > 0) {
    anchors.push(`Existing Tensions:\n${existingTensions.map((t) => `- ${t.text}`).join("\n")}`);
  }

  if (anchors.length > 0) {
    messages.push({ role: "system" as const, content: anchors.join("\n\n") });
  }

  messages.push({ role: "system" as const, content: tensionPrompt });

  return { messages, params: { model: await getModel(), max_tokens: 128, temperature: 1.0, min_p: 0.05, stop: ["</think>"] } };
};

// ─── Strategy builders ────────────────────────────────────────────────────────

function buildFoundationStrategy(
  getState: () => RootState,
  field: "shape" | "intent" | "worldState" | "attg" | "style",
): GenerationStrategy {
  const factoryMap = {
    shape:      createShapeFactory,
    intent:     createIntentFactory,
    worldState: createWorldStateFactory,
    attg:       createAttgFactory,
    style:      createStyleFactory,
  };

  return {
    requestId: api.v1.uuid(),
    messageFactory: factoryMap[field](getState),
    target: { type: "foundation", field },
    prefillBehavior: "trim",
  };
}

// ─── Effect registration ──────────────────────────────────────────────────────

function submitTensionGeneration(dispatch: AppDispatch, getState: () => RootState, tensionId: string): void {
  const strategy: GenerationStrategy = {
    requestId: api.v1.uuid(),
    messageFactory: createTensionFactory(getState, tensionId),
    target: { type: "tension", tensionId },
    prefillBehavior: "trim",
  };
  dispatch(requestQueued({ id: strategy.requestId, type: "tension", targetId: tensionId }));
  dispatch(generationSubmitted(strategy));
}

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

  subscribeEffect(matchesAction(tensionAdded), (action) => {
    submitTensionGeneration(dispatch, getState, action.payload.tension.id);
  });

  subscribeEffect(matchesAction(tensionGenerationRequested), (action) => {
    submitTensionGeneration(dispatch, getState, action.payload.tensionId);
  });

  subscribeEffect(matchesAction(attgGenerationRequested), () => {
    const strategy = buildFoundationStrategy(getState, "attg");
    dispatch(requestQueued({ id: strategy.requestId, type: "foundation", targetId: "attg" }));
    dispatch(generationSubmitted(strategy));
  });

  subscribeEffect(matchesAction(styleGenerationRequested), () => {
    const strategy = buildFoundationStrategy(getState, "style");
    dispatch(requestQueued({ id: strategy.requestId, type: "foundation", targetId: "style" }));
    dispatch(generationSubmitted(strategy));
  });
}
