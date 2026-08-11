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
  buildModelParams,
  appendXialongStyleMessage,
} from "../../utils/config";
import {
  shapeGenerationRequested,
  intentGenerationRequested,
  worldStateGenerationRequested,
  contractGenerationRequested,
  attgGenerationRequested,
  styleGenerationRequested,
  generationSubmitted,
  requestQueued,
} from "../index";
import {
  isFoundationRequestPending,
  type FoundationTarget,
} from "../selectors/runtime";
import { MessageFactory } from "nai-gen-x";
import {
  buildStoryEnginePrefix,
  buildXialongNarrativeStyleBlock,
} from "../../utils/context-builder";
import {
  CRUCIBLE_SHAPE_PROMPT,
  FOUNDATION_INTENT_PROMPT,
  FOUNDATION_WORLD_STATE_PROMPT,
  CONTRACT_GENERATE_PROMPT,
  CONTRACT_GENERATE_REQUEST,
  CONTRACT_GENERATE_PREFILL,
  ATTG_GENERATE_PROMPT,
  STYLE_GENERATE_PROMPT,
  XIALONG_STYLE,
} from "../../utils/prompts";
import type { RefineContext } from "../../chat-types/types";
import { buildRefineTail } from "../../utils/refine-strategy";

// ─── Factories ────────────────────────────────────────────────────────────────

/**
 * Shape: reads brainstorm + setting + canon, excludes foundation entirely.
 * If an existing shape name is in state, it is injected as an assistant prefill
 * so the model only regenerates the structural description.
 * Otherwise the model invents both name and description freely.
 */
const createShapeFactory =
  (getState: () => RootState): MessageFactory =>
  async () => {
    const shapePrompt = CRUCIBLE_SHAPE_PROMPT;
    const { shape: existingShape, intensity } = getState().foundation;
    const existingName = existingShape?.name ?? "";

    const [prefix, storyContext] = await Promise.all([
      buildStoryEnginePrefix(getState, { excludeSections: ["foundation"] }),
      api.v1.buildContext({ suppressScriptHooks: "self" }),
    ]);

    // If there's an existing name, anchor the model to it; otherwise let it invent freely.
    const prefill = existingName ? `SHAPE: ${existingName}\n\n` : "SHAPE: ";

    const messages: Message[] = [
      ...prefix,
      ...storyContext.slice(1), // drop NAI's story-writing system prompt
    ];

    if (intensity) {
      messages.push({
        role: "system" as const,
        content: `Intensity: ${intensity.level} — ${intensity.description}`,
      });
    }

    messages.push({ role: "system" as const, content: shapePrompt });

    await appendXialongStyleMessage(messages, XIALONG_STYLE.foundationShape);
    messages.push({ role: "assistant" as const, content: prefill });

    return {
      messages,
      params: await buildModelParams({
        max_tokens: 128,
        temperature: 0.7,
        min_p: 0.05,
        stop: ["</think>", "\n---", "---"],
      }),
    };
  };

/**
 * Intent: reads brainstorm + setting + canon, excludes foundation.
 * Injects shape separately if present — shape informs direction without making intent circular.
 */
const createIntentFactory =
  (getState: () => RootState): MessageFactory =>
  async () => {
    const intentPrompt = FOUNDATION_INTENT_PROMPT;

    const [prefix, storyContext] = await Promise.all([
      buildStoryEnginePrefix(getState, { excludeSections: ["foundation"] }),
      api.v1.buildContext({ suppressScriptHooks: "self" }),
    ]);

    const messages: Message[] = [
      ...prefix,
      ...storyContext.slice(1), // drop NAI's story-writing system prompt
    ];

    const { shape, intensity } = getState().foundation;
    if (intensity) {
      messages.push({
        role: "system" as const,
        content: `Intensity: ${intensity.level} — ${intensity.description}`,
      });
    }
    if (shape) {
      messages.push({
        role: "system" as const,
        content: `[NARRATIVE SHAPE]\n${shape.name}: ${shape.description}`,
      });
    }

    messages.push({ role: "system" as const, content: intentPrompt });
    await appendXialongStyleMessage(messages, XIALONG_STYLE.foundationIntent);

    return {
      messages,
      params: await buildModelParams({
        max_tokens: 80,
        temperature: 1.0,
        min_p: 0.05,
        stop: ["</think>", "\n"],
      }),
    };
  };

/**
 * WorldState: reads brainstorm + setting + canon, excludes foundation.
 * Injects shape + intent separately so they anchor the world state without being repeated.
 */
const createWorldStateFactory =
  (getState: () => RootState): MessageFactory =>
  async () => {
    const worldStatePrompt = FOUNDATION_WORLD_STATE_PROMPT;

    const prefix = await buildStoryEnginePrefix(getState, {
      excludeSections: ["foundation"],
    });

    const messages: Message[] = [...prefix];

    const { shape, intent, intensity } = getState().foundation;
    const anchors: string[] = [];
    if (intensity)
      anchors.push(`Intensity: ${intensity.level} — ${intensity.description}`);
    if (shape) anchors.push(`Shape: ${shape.name}: ${shape.description}`);
    if (intent) anchors.push(`Intent: ${intent}`);
    if (anchors.length > 0) {
      messages.push({ role: "system" as const, content: anchors.join("\n") });
    }

    messages.push({ role: "system" as const, content: worldStatePrompt });
    await appendXialongStyleMessage(
      messages,
      XIALONG_STYLE.foundationWorldState,
    );

    return {
      messages,
      params: await buildModelParams({
        max_tokens: 256,
        temperature: 0.85,
        min_p: 0.05,
        stop: ["</think>", "\n---", "---"],
      }),
    };
  };

/**
 * ATTG: reads foundation context (shape, intent, world state) and generates an ATTG block.
 *
 * `attg` is excluded alongside `foundation` so a re-generate sees only the
 * upstream anchors (shape/intent/worldState/intensity that we re-inject
 * below), never the existing ATTG line — otherwise the model echoes it.
 */
const createAttgFactory =
  (getState: () => RootState): MessageFactory =>
  async () => {
    const attgPrompt = ATTG_GENERATE_PROMPT;

    const prefix = await buildStoryEnginePrefix(getState, {
      excludeSections: ["foundation", "attg"],
    });
    const messages: Message[] = [...prefix];

    const { shape, intent, worldState, intensity } = getState().foundation;
    const anchors: string[] = [];
    if (intensity)
      anchors.push(`Intensity: ${intensity.level} — ${intensity.description}`);
    if (shape) anchors.push(`Shape: ${shape.name}: ${shape.description}`);
    if (intent) anchors.push(`Intent: ${intent}`);
    if (worldState) anchors.push(`World State: ${worldState}`);
    if (anchors.length > 0) {
      messages.push({ role: "system" as const, content: anchors.join("\n") });
    }

    messages.push({ role: "system" as const, content: attgPrompt });
    await appendXialongStyleMessage(messages, XIALONG_STYLE.attg);

    return {
      messages,
      params: await buildModelParams({
        max_tokens: 128,
        temperature: 0.7,
        min_p: 0.05,
        stop: ["</think>", "\n"],
      }),
    };
  };

/**
 * Style: reads foundation context (shape, intent, world state) and generates a Style block.
 *
 * `style` is excluded alongside `foundation` so a re-generate sees only the
 * upstream anchors (shape/intent/worldState/intensity that we re-inject
 * below), never the existing Style block — otherwise the model echoes it.
 */
const createStyleFactory =
  (getState: () => RootState): MessageFactory =>
  async () => {
    const stylePrompt = STYLE_GENERATE_PROMPT;

    const prefix = await buildStoryEnginePrefix(getState, {
      excludeSections: ["foundation", "style"],
    });
    const messages: Message[] = [...prefix];

    const { shape, intent, worldState, intensity } = getState().foundation;
    const anchors: string[] = [];
    if (intensity)
      anchors.push(`Intensity: ${intensity.level} — ${intensity.description}`);
    if (shape) anchors.push(`Shape: ${shape.name}: ${shape.description}`);
    if (intent) anchors.push(`Intent: ${intent}`);
    if (worldState) anchors.push(`World State: ${worldState}`);
    if (anchors.length > 0) {
      messages.push({ role: "system" as const, content: anchors.join("\n") });
    }

    messages.push({ role: "system" as const, content: stylePrompt });
    await appendXialongStyleMessage(
      messages,
      buildXialongNarrativeStyleBlock(getState()),
    );

    return {
      messages,
      params: await buildModelParams({
        max_tokens: 300,
        temperature: 0.7,
        min_p: 0.05,
        stop: ["</think>", "\n***", "\n---", "---", "\n[ S", "\n[ Style"],
      }),
    };
  };

/**
 * Contract: reads full foundation context, generates REQUIRED + PROHIBITED + EMPHASIS.
 *
 * Unlike the prose fields, this one has to come back in a fixed three-line shape,
 * so it closes with a user turn and an assistant prefill rather than trailing off
 * after a system message. Context-only prompts (system blocks and nothing else)
 * leave the model with no turn to answer, and what it continues instead is the
 * [STORY TEXT] block sitting in that context — prose where a contract should be.
 */
const createContractFactory =
  (getState: () => RootState, opts?: { prefill?: boolean }): MessageFactory =>
  async () => {
    const prefix = await buildStoryEnginePrefix(getState, {
      excludeSections: ["foundation"],
    });

    const messages: Message[] = [...prefix];

    const { shape, intent, worldState, intensity } = getState().foundation;
    const anchors: string[] = [];
    if (shape) anchors.push(`Shape: ${shape.name}: ${shape.description}`);
    if (intent) anchors.push(`Intent: ${intent}`);
    if (worldState) anchors.push(`World State: ${worldState}`);
    if (intensity)
      anchors.push(`Intensity: ${intensity.level} — ${intensity.description}`);

    if (anchors.length > 0) {
      messages.push({ role: "system" as const, content: anchors.join("\n") });
    }

    messages.push({
      role: "system" as const,
      content: CONTRACT_GENERATE_PROMPT,
    });
    messages.push({
      role: "user" as const,
      content: CONTRACT_GENERATE_REQUEST,
    });
    await appendXialongStyleMessage(messages, XIALONG_STYLE.foundationContract);
    // Opt-in: the refine builders reuse this factory and append their own tail,
    // so a prefill baked in here would strand an assistant turn mid-conversation.
    if (opts?.prefill) {
      messages.push({
        role: "assistant" as const,
        content: CONTRACT_GENERATE_PREFILL,
      });
    }

    return {
      messages,
      params: await buildModelParams({
        max_tokens: 400,
        temperature: 0.7,
        min_p: 0.05,
        stop: ["</think>", "\n---", "---"],
      }),
    };
  };

// ─── Strategy builders ────────────────────────────────────────────────────────

function buildFoundationStrategy(
  getState: () => RootState,
  field: "shape" | "intent" | "worldState" | "contract" | "attg" | "style",
): GenerationStrategy {
  const factoryMap = {
    shape: createShapeFactory,
    intent: createIntentFactory,
    worldState: createWorldStateFactory,
    // Generate-from-scratch is the one contract path that ends in a prefill.
    contract: (gs: () => RootState) =>
      createContractFactory(gs, { prefill: true }),
    attg: createAttgFactory,
    style: createStyleFactory,
  };

  return {
    requestId: api.v1.uuid(),
    messageFactory: factoryMap[field](getState),
    target: { type: "foundation", field },
    ...foundationPrefill(field),
  };
}

/** Contract is the one foundation field generated from an assistant prefill, and
 *  it has to keep it: the prefill IS the REQUIRED label, so trimming would hand
 *  parseContract a block whose first line no longer matches. The prose fields
 *  have no prefill to keep. */
function foundationPrefill(
  field: "shape" | "intent" | "worldState" | "contract" | "attg" | "style",
): Pick<GenerationStrategy, "prefillBehavior" | "assistantPrefill"> {
  return field === "contract"
    ? {
        prefillBehavior: "keep" as const,
        assistantPrefill: CONTRACT_GENERATE_PREFILL,
      }
    : { prefillBehavior: "trim" as const };
}

// ─── Refine strategy builders ────────────────────────────────────────────────

export function buildIntentStrategy(
  getState: () => RootState,
  opts?: {
    refineContext?: RefineContext;
    entryId?: string;
    requestId?: string;
  },
): GenerationStrategy {
  const baseFactory = createIntentFactory(getState);
  const refineContext = opts?.refineContext;
  const messageFactory: MessageFactory = refineContext
    ? async () => {
        const base = await baseFactory();
        return {
          ...base,
          messages: buildRefineTail(base.messages, refineContext),
        };
      }
    : baseFactory;
  return {
    requestId: opts?.requestId ?? api.v1.uuid(),
    messageFactory,
    target: { type: "foundation", field: "intent" },
    prefillBehavior: "trim",
  };
}

export function buildContractStrategy(
  getState: () => RootState,
  opts?: {
    refineContext?: RefineContext;
    entryId?: string;
    requestId?: string;
  },
): GenerationStrategy {
  const baseFactory = createContractFactory(getState);
  const refineContext = opts?.refineContext;
  const messageFactory: MessageFactory = refineContext
    ? async () => {
        const base = await baseFactory();
        return {
          ...base,
          messages: buildRefineTail(base.messages, refineContext),
        };
      }
    : baseFactory;
  return {
    requestId: opts?.requestId ?? api.v1.uuid(),
    messageFactory,
    target: { type: "foundation", field: "contract" },
    prefillBehavior: "trim",
  };
}

export function buildAttgStrategy(
  getState: () => RootState,
  opts?: {
    refineContext?: RefineContext;
    entryId?: string;
    requestId?: string;
  },
): GenerationStrategy {
  const baseFactory = createAttgFactory(getState);
  const refineContext = opts?.refineContext;
  const messageFactory: MessageFactory = refineContext
    ? async () => {
        const base = await baseFactory();
        return {
          ...base,
          messages: buildRefineTail(base.messages, refineContext),
        };
      }
    : baseFactory;
  return {
    requestId: opts?.requestId ?? api.v1.uuid(),
    messageFactory,
    target: { type: "foundation", field: "attg" },
    prefillBehavior: "trim",
  };
}

export function buildStyleStrategy(
  getState: () => RootState,
  opts?: {
    refineContext?: RefineContext;
    entryId?: string;
    requestId?: string;
  },
): GenerationStrategy {
  const baseFactory = createStyleFactory(getState);
  const refineContext = opts?.refineContext;
  const messageFactory: MessageFactory = refineContext
    ? async () => {
        const base = await baseFactory();
        return {
          ...base,
          messages: buildRefineTail(base.messages, refineContext),
        };
      }
    : baseFactory;
  return {
    requestId: opts?.requestId ?? api.v1.uuid(),
    messageFactory,
    target: { type: "foundation", field: "style" },
    prefillBehavior: "trim",
  };
}

// ─── Effect registration ──────────────────────────────────────────────────────

function submitFoundation(
  dispatch: AppDispatch,
  getState: () => RootState,
  field: FoundationTarget,
): void {
  // One generation per field at a time. Import All dispatches Shape and Intent
  // together, and a mobile tap arriving twice would otherwise submit each of
  // them twice under unrelated request ids.
  if (isFoundationRequestPending(getState(), field)) return;
  const strategy = buildFoundationStrategy(getState, field);
  dispatch(
    requestQueued({
      id: strategy.requestId,
      type: "foundation",
      targetId: field,
    }),
  );
  dispatch(generationSubmitted(strategy));
}

export function registerFoundationEffects(
  subscribeEffect: Store<RootState>["subscribeEffect"],
  dispatch: AppDispatch,
  getState: () => RootState,
): void {
  subscribeEffect(matchesAction(shapeGenerationRequested), () => {
    submitFoundation(dispatch, getState, "shape");
  });

  subscribeEffect(matchesAction(intentGenerationRequested), () => {
    submitFoundation(dispatch, getState, "intent");
  });

  subscribeEffect(matchesAction(worldStateGenerationRequested), () => {
    submitFoundation(dispatch, getState, "worldState");
  });

  subscribeEffect(matchesAction(contractGenerationRequested), () => {
    submitFoundation(dispatch, getState, "contract");
  });

  subscribeEffect(matchesAction(attgGenerationRequested), () => {
    submitFoundation(dispatch, getState, "attg");
  });

  subscribeEffect(matchesAction(styleGenerationRequested), () => {
    submitFoundation(dispatch, getState, "style");
  });
}
