import { Store, matchesAction } from "nai-store";
import { RootState, AppDispatch, GenerationStrategy } from "../types";
import {
  buildModelParams,
  appendXialongStyleMessage,
} from "../../utils/config";
import {
  bootstrapRequested,
  generationSubmitted,
  requestQueued,
} from "../index";
import { MessageFactory } from "nai-gen-x";
import { buildStoryEnginePrefix } from "../../utils/context-builder";
import {
  BOOTSTRAP_P1_PROMPT,
  buildOpeningDirectionPrompt,
  XIALONG_STYLE,
} from "../../utils/prompts";

// ─── Phase 1 factory ─────────────────────────────────────────────────────────
// Narrow context: just ATTG/style/foundation/setting — no world entities,
// no brainstorm, no story text. Generates the opening paragraph only.
//
// `guidance` is the Opening Scene modal's answer to "Open the story with:".
// Blank means the writer generated without a direction — the prompt is then
// exactly what it was before the modal existed.

const createBootstrapP1Factory =
  (getState: () => RootState, guidance: string): MessageFactory =>
  async () => {
    const prefix = await buildStoryEnginePrefix(getState, {
      excludeSections: ["worldEntities", "storyText"],
    });

    const messages: Message[] = [...prefix];

    // Re-inject compact foundation anchors close to the instruction
    const { shape, intent, worldState, intensity, contract } =
      getState().foundation;
    const anchors: string[] = [];
    if (intensity)
      anchors.push(`Intensity: ${intensity.level} — ${intensity.description}`);
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
    if (guidance.trim()) {
      messages.push({
        role: "system" as const,
        content: buildOpeningDirectionPrompt(guidance),
      });
    }
    await appendXialongStyleMessage(messages, XIALONG_STYLE.bootstrap);

    return {
      messages,
      params: await buildModelParams({
        max_tokens: 384,
        temperature: 1.0,
        min_p: 0.05,
        frequency_penalty: 0.15,
        stop: ["</think>"],
      }),
    };
  };

// ─── Phase 2 factory ─────────────────────────────────────────────────────────
// Full world context (no story text section — that comes from buildContext).
// buildContext supplies lorebook entries activated by keywords in the story
// so far, plus the real story text. Instruction sits in strong position
// (after story text, close to generation).

function buildBootstrapP1Strategy(
  getState: () => RootState,
  guidance: string,
): GenerationStrategy {
  return {
    requestId: api.v1.uuid(),
    messageFactory: createBootstrapP1Factory(getState, guidance),
    target: { type: "bootstrap" },
    prefillBehavior: "trim",
  };
}

export function registerBootstrapEffects(
  subscribeEffect: Store<RootState>["subscribeEffect"],
  dispatch: AppDispatch,
  getState: () => RootState,
): void {
  // Stage 1 — "Opening Scene". User-triggered from the Opening Scene modal,
  // which carries the writer's direction; does NOT auto-chain into Continue.
  subscribeEffect(matchesAction(bootstrapRequested), (action) => {
    const strategy = buildBootstrapP1Strategy(
      getState,
      action.payload.guidance,
    );
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
