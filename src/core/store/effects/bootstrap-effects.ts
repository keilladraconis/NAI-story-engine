import { Store, matchesAction } from "nai-store";
import { RootState, AppDispatch, GenerationStrategy } from "../types";
import { buildModelParams, appendXialongStyleMessage } from "../../utils/config";
import { bootstrapRequested, generationSubmitted, requestQueued } from "../index";
import { MessageFactory } from "nai-gen-x";
import { buildStoryEnginePrefix } from "../../utils/context-builder";
import {
  BOOTSTRAP_P1_PROMPT,
  BOOTSTRAP_CONTINUE_PROMPT,
  XIALONG_STYLE,
} from "../../utils/prompts";

// ─── Phase 1 factory ─────────────────────────────────────────────────────────
// Narrow context: just ATTG/style/foundation/setting — no world entities,
// no brainstorm, no story text. Generates the opening paragraph only.

const createBootstrapP1Factory =
  (getState: () => RootState): MessageFactory =>
  async () => {
    const prefix = await buildStoryEnginePrefix(getState, {
      excludeSections: ["worldEntities", "storyText"],
    });

    const messages: Message[] = [...prefix];

    // Re-inject compact foundation anchors close to the instruction
    const { shape, intent, worldState, intensity, contract } = getState().foundation;
    const anchors: string[] = [];
    if (intensity) anchors.push(`Intensity: ${intensity.level} — ${intensity.description}`);
    if (shape) anchors.push(`Shape: ${shape.name}: ${shape.description}`);
    if (intent) anchors.push(`Intent: ${intent}`);
    if (worldState) anchors.push(`World State: ${worldState}`);
    if (contract) {
      anchors.push(
        `Story Contract:\nRequired: ${contract.required}\nProhibited: ${contract.prohibited}\nEmphasis: ${contract.emphasis}`,
      );
    }
    if (anchors.length > 0) {
      messages.push({ role: "system" as const, content: anchors.join("\n\n") });
    }

    messages.push({ role: "system" as const, content: BOOTSTRAP_P1_PROMPT });
    await appendXialongStyleMessage(messages, XIALONG_STYLE.bootstrap);

    return {
      messages,
      params: await buildModelParams({
        max_tokens: 384,
        temperature: 1.0,
        min_p: 0.05,
        stop: ["</think>"],
      }),
    };
  };

// ─── Phase 2 factory ─────────────────────────────────────────────────────────
// Full world context (no story text section — that comes from buildContext).
// buildContext supplies lorebook entries activated by keywords in the story
// so far, plus the real story text. Instruction sits in strong position
// (after story text, close to generation).

const createBootstrapContinueFactory =
  (getState: () => RootState): MessageFactory =>
  async () => {
    const [prefix, storyContext] = await Promise.all([
      buildStoryEnginePrefix(getState, { excludeSections: ["storyText", "brainstorm"] }),
      api.v1.buildContext({ suppressScriptHooks: "self" }),
    ]);

    const messages: Message[] = [
      ...prefix,
      ...storyContext.slice(1), // drop NAI's system prompt, keep lorebook entries + story text
    ];

    // Compact foundation anchors immediately before the continue instruction
    const { shape, intent, intensity, contract } = getState().foundation;
    const anchors: string[] = [];
    if (intensity) anchors.push(`Intensity: ${intensity.level} — ${intensity.description}`);
    if (shape) anchors.push(`Shape: ${shape.name}: ${shape.description}`);
    if (intent) anchors.push(`Intent: ${intent}`);
    if (contract) {
      anchors.push(
        `Story Contract:\nRequired: ${contract.required}\nProhibited: ${contract.prohibited}\nEmphasis: ${contract.emphasis}`,
      );
    }
    if (anchors.length > 0) {
      messages.push({ role: "system" as const, content: anchors.join("\n\n") });
    }

    messages.push({ role: "system" as const, content: BOOTSTRAP_CONTINUE_PROMPT });
    await appendXialongStyleMessage(messages, XIALONG_STYLE.bootstrapContinue);

    return {
      messages,
      params: await buildModelParams({
        max_tokens: 384,
        temperature: 1.0,
        min_p: 0.05,
        stop: ["</think>", "\n***", "\n---", "\n⁂", "\n[ "],
      }),
    };
  };

// ─── Strategy builders ────────────────────────────────────────────────────────

function buildBootstrapP1Strategy(getState: () => RootState): GenerationStrategy {
  return {
    requestId: api.v1.uuid(),
    messageFactory: createBootstrapP1Factory(getState),
    target: { type: "bootstrap" },
    prefillBehavior: "trim",
  };
}

export function buildBootstrapContinueStrategy(
  getState: () => RootState,
  iteration: number,
): GenerationStrategy {
  return {
    requestId: api.v1.uuid(),
    messageFactory: createBootstrapContinueFactory(getState),
    target: { type: "bootstrapContinue", iteration },
    prefillBehavior: "trim",
  };
}

// ─── Effect registration ──────────────────────────────────────────────────────

export function registerBootstrapEffects(
  subscribeEffect: Store<RootState>["subscribeEffect"],
  dispatch: AppDispatch,
  getState: () => RootState,
): void {
  subscribeEffect(matchesAction(bootstrapRequested), () => {
    const strategy = buildBootstrapP1Strategy(getState);
    dispatch(
      requestQueued({
        id: strategy.requestId,
        type: "bootstrap",
        targetId: "bootstrap",
      }),
    );
    dispatch(generationSubmitted(strategy));
  });
}
