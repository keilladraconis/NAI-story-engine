/**
 * Foundation Effects — Generation for Narrative Foundation fields.
 *
 * Handles shapeGenerationRequested, intentGenerationRequested, worldStateGenerationRequested
 * by building a context-aware prompt and submitting to the generation engine.
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

// ─── Context helpers ──────────────────────────────────────────────────────────

function formatFoundationContext(state: RootState): string {
  const { foundation } = state;
  const lines: string[] = [];
  if (foundation.shape)       lines.push(`Shape: ${foundation.shape}`);
  if (foundation.intent)      lines.push(`Intent: ${foundation.intent}`);
  if (foundation.worldState)  lines.push(`World State: ${foundation.worldState}`);
  const active = foundation.tensions.filter((t) => !t.resolved);
  if (active.length > 0) {
    lines.push(`Active Tensions:\n${active.map((t) => `- ${t.text}`).join("\n")}`);
  }
  return lines.join("\n");
}

async function getSystemPrompt(): Promise<string> {
  return String((await api.v1.config.get("system_prompt")) || "You are a Story Engine Agent.");
}

// ─── Factories ────────────────────────────────────────────────────────────────

const createShapeFactory = (getState: () => RootState): MessageFactory => async () => {
  const systemPrompt = await getSystemPrompt();
  const shapePrompt = String((await api.v1.config.get("crucible_shape_prompt")) || "");
  const state = getState();
  const foundation = formatFoundationContext(state);

  const messages: Message[] = [
    { role: "system" as const, content: systemPrompt },
    ...(foundation ? [{ role: "system" as const, content: foundation }] : []),
    { role: "system" as const, content: shapePrompt },
    { role: "assistant" as const, content: "SHAPE: " },
  ];

  return { messages, params: { model: "glm-4-6", max_tokens: 128, temperature: 0.7, min_p: 0.05, stop: ["</think>"] } };
};

const createIntentFactory = (getState: () => RootState): MessageFactory => async () => {
  const systemPrompt = await getSystemPrompt();
  const intentPrompt = String((await api.v1.config.get("crucible_intent_prompt")) || "");
  const state = getState();
  const foundation = formatFoundationContext(state);

  const messages: Message[] = [
    { role: "system" as const, content: systemPrompt },
    ...(foundation ? [{ role: "system" as const, content: foundation }] : []),
    { role: "system" as const, content: intentPrompt },
  ];

  return { messages, params: { model: "glm-4-6", max_tokens: 1024, temperature: 1.0, min_p: 0.05, stop: ["</think>"] } };
};

const createWorldStateFactory = (getState: () => RootState): MessageFactory => async () => {
  const systemPrompt = await getSystemPrompt();
  const worldStatePrompt = String((await api.v1.config.get("foundation_world_state_prompt")) || "");
  const state = getState();
  const foundation = formatFoundationContext(state);

  const messages: Message[] = [
    { role: "system" as const, content: systemPrompt },
    ...(foundation ? [{ role: "system" as const, content: foundation }] : []),
    { role: "system" as const, content: worldStatePrompt },
  ];

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
