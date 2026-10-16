import { Store, matchesAction } from "nai-store";
import { RootState, AppDispatch, GenerationStrategy } from "../types";
import {
  buildModelParams,
  appendXialongStyleMessage,
} from "../../utils/config";
import {
  bootstrapRequested,
  bootstrapContinueRequested,
  generationSubmitted,
  requestQueued,
} from "../index";
import { MessageFactory } from "nai-gen-x";
import { buildStoryEnginePrefix } from "../../utils/context-builder";
import {
  BOOTSTRAP_P1_PROMPT,
  BOOTSTRAP_CONTINUE_PROMPT,
  buildOpeningDirectionPrompt,
  XIALONG_STYLE,
} from "../../utils/prompts";

/** Compact Foundation anchors, re-injected close to the instruction. */
function pushFoundationAnchors(messages: Message[], state: RootState): void {
  const { situation, worldState, intensity, contract } = state.foundation;
  const anchors: string[] = [];
  if (intensity)
    anchors.push(`Intensity: ${intensity.level} — ${intensity.description}`);
  if (situation) anchors.push(`Situation: ${situation}`);
  if (worldState) anchors.push(`World State: ${worldState}`);
  if (contract) {
    anchors.push(
      `Story Contract:\nRequired: ${contract.required}\nProhibited: ${contract.prohibited}\nEmphasis: ${contract.emphasis}`,
    );
  }
  if (anchors.length > 0) {
    messages.push({ role: "system" as const, content: anchors.join("\n\n") });
  }
}

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

    pushFoundationAnchors(messages, getState());

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
// Continue Scene. The World is in the prefix, so the cast and the place can be
// brought onto the page by name; buildContext supplies the lorebook entries the
// story so far activates, plus the story text. The instruction sits last, close
// to generation.

const createBootstrapContinueFactory =
  (getState: () => RootState): MessageFactory =>
  async () => {
    const [prefix, storyContext] = await Promise.all([
      buildStoryEnginePrefix(getState, { excludeSections: ["storyText"] }),
      api.v1.buildContext({ suppressScriptHooks: "all" }),
    ]);

    const messages: Message[] = [
      ...prefix,
      ...storyContext.slice(1), // drop NAI's system prompt, keep lorebook entries + story text
    ];

    pushFoundationAnchors(messages, getState());

    messages.push({
      role: "system" as const,
      content: BOOTSTRAP_CONTINUE_PROMPT,
    });
    await appendXialongStyleMessage(messages, XIALONG_STYLE.bootstrapContinue);

    return {
      messages,
      params: await buildModelParams({
        max_tokens: 384,
        temperature: 1.0,
        min_p: 0.05,
        frequency_penalty: 0.15,
        stop: ["</think>", "\n***", "\n---", "\n⁂", "\n[ "],
      }),
    };
  };

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

function buildBootstrapContinueStrategy(
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

/** An opening or a continuation already queued or running. A second press
 *  would append a second passage written from the same page. */
function bootstrapPending(state: RootState): boolean {
  const { queue, activeRequest } = state.runtime;
  const mine = (r: { type: string }) =>
    r.type === "bootstrap" || r.type === "bootstrapContinue";
  return queue.some(mine) || (activeRequest !== null && mine(activeRequest));
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

  // Stage 2+ — "Continue Scene". One passage per press, no auto-chain. The
  // request is queued before the await so a second press finds it; iteration
  // is the document's length, for the journal label only.
  subscribeEffect(matchesAction(bootstrapContinueRequested), async () => {
    if (bootstrapPending(getState())) return;
    const requestId = api.v1.uuid();
    dispatch(
      requestQueued({
        id: requestId,
        type: "bootstrapContinue",
        targetId: "bootstrap",
      }),
    );
    const iteration = (await api.v1.document.sectionIds()).length;
    dispatch(
      generationSubmitted({
        ...buildBootstrapContinueStrategy(getState, iteration),
        requestId,
      }),
    );
  });
}
