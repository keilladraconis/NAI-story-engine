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
  const state = getState();
  const foundation = formatFoundationContext(state);

  const instruction = [
    "Generate a dramatic shape for this story.",
    "A shape is a single evocative word or short phrase naming the narrative archetype (e.g. TRAGEDY, HEIST, REDEMPTION ARC, SLOW BURN, WHODUNIT).",
    "Follow it with a single sentence describing what that shape means for this specific story.",
    "Format: SHAPE_NAME: one sentence description.",
    "Output only this — no preamble, no explanation.",
  ].join(" ");

  const messages: Message[] = [
    { role: "system" as const, content: systemPrompt },
    ...(foundation ? [{ role: "system" as const, content: foundation }] : []),
    { role: "user" as const, content: instruction },
  ];

  return { messages, params: { model: "glm-4-6", max_tokens: 128, temperature: 0.85, stop: ["</think>"] } };
};

const createIntentFactory = (getState: () => RootState): MessageFactory => async () => {
  const systemPrompt = await getSystemPrompt();
  const state = getState();
  const foundation = formatFoundationContext(state);

  const instruction = [
    "Write the narrative intent for this story in 2-3 sentences.",
    "Describe what the story is fundamentally about — the core themes, the emotional journey, what the author wants to explore.",
    "Be specific and evocative. Output only the intent — no preamble.",
  ].join(" ");

  const messages: Message[] = [
    { role: "system" as const, content: systemPrompt },
    ...(foundation ? [{ role: "system" as const, content: foundation }] : []),
    { role: "user" as const, content: instruction },
  ];

  return { messages, params: { model: "glm-4-6", max_tokens: 256, temperature: 0.85, stop: ["</think>"] } };
};

const createWorldStateFactory = (getState: () => RootState): MessageFactory => async () => {
  const systemPrompt = await getSystemPrompt();
  const state = getState();
  const foundation = formatFoundationContext(state);

  const instruction = [
    "Describe the current state of the world at the story's opening.",
    "Cover: the dominant mood or atmosphere, ongoing conflicts or tensions, power dynamics, and what is visibly in flux.",
    "3-5 sentences. Output only the world state description — no preamble.",
  ].join(" ");

  const messages: Message[] = [
    { role: "system" as const, content: systemPrompt },
    ...(foundation ? [{ role: "system" as const, content: foundation }] : []),
    { role: "user" as const, content: instruction },
  ];

  return { messages, params: { model: "glm-4-6", max_tokens: 256, temperature: 0.85, stop: ["</think>"] } };
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
