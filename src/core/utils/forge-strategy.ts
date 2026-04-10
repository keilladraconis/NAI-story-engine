/**
 * Forge Strategy — Intent-driven world element generation.
 *
 * Message ordering (cache-stability first):
 *   1. system: forge_prompt
 *   2. assistant: [BRAINSTORM]        — stable, captured at loop start
 *   3. assistant: [STORY SHAPE]       — stable (foundation.shape)
 *   4. assistant: [STORY INTENT]      — stable (foundation.intent — strategic/persistent)
 *   5. assistant: [FORGE GUIDANCE]     — stable (forge input — tactical/per-session)
 *   6. assistant: === ESTABLISHED WORLD === — semi-stable (changes on cast)
 *   7. assistant: === WORLD STATE ===       — volatile (recent narrative changes)
 *   8. user: step instruction
 *   9. assistant: prior command log — grows each step; primed with trailing [
 *
 * The prior command log is the key context mechanism: GLM sees its own prior
 * output verbatim and naturally continues the command sequence, preventing
 * recreation of already-forged elements without any extra dedup logic.
 */

import { RootState, GenerationStrategy } from "../store/types";
import { MessageFactory } from "nai-gen-x";
import { buildModelParams, appendXialongStyleMessage } from "./config";
import { XIALONG_STYLE } from "./prompts";
import { WORLD_ENTRY_CATEGORIES } from "../store/types";
import { FieldID, DulfsFieldID } from "../../config/field-definitions";
import { TYPE_TO_FIELD } from "./crucible-command-parser";
import { FORGE_PROMPT } from "./prompts";

const FIELD_TO_TYPE: Record<string, string> = Object.fromEntries(
  Object.entries(TYPE_TO_FIELD).map(([type, fieldId]) => [fieldId, type]),
);

export const FORGE_MAX_STEPS = 12;

const FIELD_LABEL: Record<DulfsFieldID, string> = {
  [FieldID.DramatisPersonae]: "Characters",
  [FieldID.UniverseSystems]: "Systems",
  [FieldID.Locations]: "Locations",
  [FieldID.Factions]: "Factions",
  [FieldID.SituationalDynamics]: "Situations",
  [FieldID.Topics]: "Topics",
};

function formatEstablishedWorld(state: RootState): string {
  const live = Object.values(state.world.entitiesById).filter((e) => e.lifecycle === "live");
  if (live.length === 0) return "";

  const groups = new Map<DulfsFieldID, typeof live>();
  for (const e of live) {
    const list = groups.get(e.categoryId) ?? [];
    list.push(e);
    groups.set(e.categoryId, list);
  }

  const lines: string[] = ["=== ESTABLISHED WORLD ==="];
  for (const fieldId of WORLD_ENTRY_CATEGORIES) {
    const group = groups.get(fieldId);
    if (!group) continue;
    lines.push(`${FIELD_LABEL[fieldId]}:`);
    for (const e of group) {
      lines.push(
        `  - ${e.name}${e.summary ? `: ${e.summary.slice(0, 120)}` : ""}`,
      );
    }
  }

  return lines.join("\n");
}

function formatWorldState(state: RootState): string {
  const { foundation } = state;
  const parts: string[] = [];

  if (foundation.worldState) {
    parts.push(`=== WORLD STATE ===\n${foundation.worldState}`);
  }

  const activeTensions = foundation.tensions.filter((t) => !t.resolved);
  if (activeTensions.length > 0) {
    parts.push(
      `=== TENSIONS ===\n${activeTensions.map((t) => `- ${t.text}`).join("\n")}`,
    );
  }

  return parts.join("\n");
}

/**
 * Synthesizes the prior-step command log from all current draft entities and groups.
 * Only correct-syntax commands appear — bad GLM output that failed to parse
 * never enters context.
 */
function buildForgePassLog(state: RootState): string {
  const draftEntities = Object.values(state.world.entitiesById).filter(
    (e) => e.lifecycle === "draft",
  );

  const lines: string[] = [];
  for (const entity of draftEntities) {
    const type = FIELD_TO_TYPE[entity.categoryId] ?? "CHARACTER";
    const desc = entity.summary ? ` | ${entity.summary}` : "";
    lines.push(`[CREATE ${type} "${entity.name}"${desc}]`);
  }

  // Include existing threads so the model doesn't recreate them
  for (const group of state.world.groups) {
    const memberNames = group.entityIds
      .map((id) => state.world.entitiesById[id]?.name)
      .filter((name): name is string => name !== undefined);
    if (memberNames.length < 2) continue;
    const membersStr = memberNames.map((n) => `"${n}"`).join(", ");
    const descPart = group.summary ? ` | ${group.summary}` : "";
    lines.push(`[THREAD "${group.title}" | ${membersStr}${descPart}]`);
  }

  return lines.join("\n").trim();
}

/**
 * Message factory for one step of the forge loop.
 * All state is read JIT so the synthesized pass log is always current.
 */
export const createForgeFactory = (
  getState: () => RootState,
  step: number,
  forgeGuidance: string,
  brainstormContext: string,
): MessageFactory => {
  return async () => {
    const systemPrompt = String(
      FORGE_PROMPT,
    );

    const state = getState();
    const { foundation } = state;

    const messages: Message[] = [];

    // 1. System prompt
    messages.push({ role: "system", content: systemPrompt });

    // 2. Brainstorm context — stable, captured at loop start
    if (brainstormContext) {
      messages.push({
        role: "assistant",
        content: `=== BRAINSTORM ===\n${brainstormContext}`,
      });
    }

    // 3. Story shape — stable
    if (foundation.shape) {
      messages.push({
        role: "assistant",
        content: `=== STORY SHAPE ===\n${foundation.shape.name}\n${foundation.shape.description}`,
      });
    }

    // 4. Foundation intent (strategic, persistent) — stable
    if (foundation.intent) {
      messages.push({
        role: "assistant",
        content: `=== STORY INTENT ===\n${foundation.intent}`,
      });
    }

    // 5. Forge intent (tactical, per-session) — stable
    if (forgeGuidance.trim()) {
      messages.push({
        role: "assistant",
        content: `=== FORGE GUIDANCE ===\n${forgeGuidance.trim()}`,
      });
    }

    // 6. Established world (live entities) — semi-stable
    const establishedWorld = formatEstablishedWorld(state);
    if (establishedWorld) {
      messages.push({ role: "assistant", content: establishedWorld });
    }

    // 7. World state + tensions — volatile (recent narrative changes)
    const worldStateText = formatWorldState(state);
    if (worldStateText) {
      messages.push({ role: "assistant", content: worldStateText });
    }

    // 8. User: step instruction
    const stepNote =
      step === FORGE_MAX_STEPS - 1
        ? `Step ${step} of ${FORGE_MAX_STEPS}. Consider closing with [CRITIQUE] if the draft is complete.`
        : `Step ${step} of ${FORGE_MAX_STEPS}. Emit one command.`;
    messages.push({ role: "user", content: stepNote });

    // 9. Prior command log + prefill primer — single assistant message.
    //    Combining the pass log and prefill "[" into one message avoids
    //    consecutive assistant turns. The prefill "[" MUST be in the messages
    //    array sent to the model so it generates the continuation (e.g. "CREATE...")
    //    rather than the full command (e.g. "[CREATE..."). The strategy's
    //    assistantPrefill then prepends "[" client-side to accumulatedText,
    //    giving the handler a fully-formed "[CREATE CHARACTER ...]" to parse.
    const passLog = buildForgePassLog(state);
    const prefill = step >= FORGE_MAX_STEPS ? "[CRITIQUE |" : "[";
    const assistantContent = passLog ? `${passLog}\n${prefill}` : prefill;
    await appendXialongStyleMessage(messages, XIALONG_STYLE.forge);
    messages.push({ role: "assistant", content: assistantContent });

    return {
      messages,
      params: await buildModelParams({
        max_tokens: 256,
        temperature: 0.85,
        min_p: 0.05,
      }),
    };
  };
};

/**
 * Builds a GenerationStrategy for one step of the forge loop.
 */
export const buildForgeStrategy = (
  getState: () => RootState,
  step: number,
  forgeGuidance: string,
  brainstormContext?: string,
): GenerationStrategy => {
  const prefill = step >= FORGE_MAX_STEPS ? "[CRITIQUE |" : "[";
  return {
    requestId: api.v1.uuid(),
    messageFactory: createForgeFactory(
      getState,
      step,
      forgeGuidance,
      brainstormContext ?? "",
    ),
    target: {
      type: "forge",
      step,
      forgeGuidance,
      brainstormContext: brainstormContext ?? "",
    },
    prefillBehavior: "keep",
    assistantPrefill: prefill,
  };
};

