import { Store, matchesAction } from "nai-store";
import { RootState, AppDispatch, GenerationStrategy } from "../types";
import { buildModelParams, appendXialongStyleMessage } from "../../utils/config";
import { bootstrapRequested, generationSubmitted, requestQueued } from "../index";
import { MessageFactory } from "nai-gen-x";
import { buildStoryEnginePrefix } from "../../utils/context-builder";
import { BOOTSTRAP_PROMPT, XIALONG_STYLE } from "../../utils/prompts";

const createBootstrapFactory =
  (getState: () => RootState): MessageFactory =>
  async () => {
    const [prefix, storyContext] = await Promise.all([
      buildStoryEnginePrefix(getState),
      api.v1.buildContext({ suppressScriptHooks: "self" }),
    ]);

    const messages: Message[] = [
      ...prefix,
      ...storyContext.slice(1), // drop NAI's story-writing system prompt
    ];

    const { shape, intent, worldState, intensity, contract } =
      getState().foundation;
    const anchors: string[] = [];
    if (intensity)
      anchors.push(`Intensity: ${intensity.level} — ${intensity.description}`);
    if (shape)
      anchors.push(`Shape: ${shape.name}: ${shape.description}`);
    if (intent) anchors.push(`Intent: ${intent}`);
    if (worldState) anchors.push(`World State: ${worldState}`);
    if (contract) {
      anchors.push(
        `Story Contract:\nRequired: ${contract.required}\nProhibited: ${contract.prohibited}\nEmphasis: ${contract.emphasis}`,
      );
    }
    if (anchors.length > 0) {
      messages.push({
        role: "system" as const,
        content: anchors.join("\n\n"),
      });
    }

    messages.push({ role: "system" as const, content: BOOTSTRAP_PROMPT });
    await appendXialongStyleMessage(messages, XIALONG_STYLE.bootstrap);

    return {
      messages,
      params: await buildModelParams({
        max_tokens: 1024,
        temperature: 1.0,
        min_p: 0.05,
        stop: ["</think>"],
      }),
    };
  };

function buildBootstrapStrategy(getState: () => RootState): GenerationStrategy {
  return {
    requestId: api.v1.uuid(),
    messageFactory: createBootstrapFactory(getState),
    target: { type: "bootstrap" },
    prefillBehavior: "trim",
  };
}

export function registerBootstrapEffects(
  subscribeEffect: Store<RootState>["subscribeEffect"],
  dispatch: AppDispatch,
  getState: () => RootState,
): void {
  subscribeEffect(matchesAction(bootstrapRequested), () => {
    const strategy = buildBootstrapStrategy(getState);
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
