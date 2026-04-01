/**
 * Forge Strategy — Intent-driven world element generation.
 *
 * Message ordering (cache-stability first):
 *   1. system: forge_prompt
 *   2. assistant: [BRAINSTORM]        — stable, captured at loop start
 *   3. assistant: [STORY SHAPE]       — stable (foundation.shape + storyStorage name fallback)
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
import { getModel } from "./config";
import { WORLD_ENTRY_CATEGORIES } from "../store/types";
import { FieldID, DulfsFieldID } from "../../config/field-definitions";
import { TYPE_TO_FIELD } from "./crucible-command-parser";
import { STORAGE_KEYS } from "../../ui/framework/ids";

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
  const live = state.world.entities.filter((e) => e.lifecycle === "live");
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
      lines.push(`  - ${e.name}${e.summary ? `: ${e.summary.slice(0, 120)}` : ""}`);
    }
  }

  if (state.world.relationships.length > 0) {
    lines.push("Relationships:");
    for (const rel of state.world.relationships) {
      const from = state.world.entities.find((e) => e.id === rel.fromEntityId)?.name ?? rel.fromEntityId;
      const to = state.world.entities.find((e) => e.id === rel.toEntityId)?.name ?? rel.toEntityId;
      lines.push(`  - ${from} → ${to}: ${rel.description}`);
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
    parts.push(`=== TENSIONS ===\n${activeTensions.map((t) => `- ${t.text}`).join("\n")}`);
  }

  return parts.join("\n");
}

/**
 * Synthesizes the prior-step command log from successfully parsed entities
 * and relationships in state. Only correct-syntax commands appear — bad GLM
 * output that failed to parse never enters context.
 */
function buildForgePassLog(state: RootState, batchId: string): string {
  const batchEntities = state.world.entities.filter(
    (e) => e.batchId === batchId && e.lifecycle === "draft",
  );
  if (batchEntities.length === 0) return "";

  const batchEntityIds = new Set(batchEntities.map((e) => e.id));
  const lines: string[] = [];

  for (const entity of batchEntities) {
    const type = FIELD_TO_TYPE[entity.categoryId] ?? "CHARACTER";
    lines.push(`[CREATE ${type} "${entity.name}"]`);
    if (entity.summary) lines.push(entity.summary);
    lines.push("");
  }

  const batchRels = state.world.relationships.filter(
    (r) => batchEntityIds.has(r.fromEntityId) && batchEntityIds.has(r.toEntityId),
  );
  for (const rel of batchRels) {
    const from = batchEntities.find((e) => e.id === rel.fromEntityId)!;
    const to = batchEntities.find((e) => e.id === rel.toEntityId)!;
    lines.push(`[LINK "${from.name}" → "${to.name}"]`);
    if (rel.description) lines.push(rel.description);
    lines.push("");
  }

  return lines.join("\n").trim();
}

/**
 * Message factory for one step of the forge loop.
 * All state is read JIT so the synthesized pass log is always current.
 */
export const createForgeFactory = (
  getState: () => RootState,
  batchId: string,
  step: number,
  forgeGuidance: string,
  brainstormContext: string,
): MessageFactory => {
  return async () => {
    const systemPrompt = String(
      (await api.v1.config.get("forge_prompt")) || DEFAULT_FORGE_PROMPT,
    );

    const state = getState();
    const { foundation } = state;

    const messages: Message[] = [];

    // 1. System prompt
    messages.push({ role: "system", content: systemPrompt });

    // 2. Brainstorm context — stable, captured at loop start
    if (brainstormContext) {
      messages.push({ role: "assistant", content: `=== BRAINSTORM ===\n${brainstormContext}` });
    }

    // 3. Story shape — stable; fall back to storyStorage name if description not yet saved
    const shapeName = String(
      (await api.v1.storyStorage.get(STORAGE_KEYS.FOUNDATION_SHAPE_NAME_UI)) || "",
    ).trim();
    if (foundation.shape) {
      messages.push({
        role: "assistant",
        content: `=== STORY SHAPE ===\n${foundation.shape.name || shapeName}\n${foundation.shape.description}`,
      });
    } else if (shapeName) {
      messages.push({ role: "assistant", content: `=== STORY SHAPE ===\n${shapeName}` });
    }

    // 4. Foundation intent (strategic, persistent) — stable
    if (foundation.intent) {
      messages.push({ role: "assistant", content: `=== STORY INTENT ===\n${foundation.intent}` });
    }

    // 5. Forge intent (tactical, per-session) — stable
    if (forgeGuidance.trim()) {
      messages.push({ role: "assistant", content: `=== FORGE GUIDANCE ===\n${forgeGuidance.trim()}` });
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
    const stepNote = step === FORGE_MAX_STEPS - 1
      ? `Step ${step} of ${FORGE_MAX_STEPS}. Consider closing with [CRITIQUE] if the draft is complete.`
      : `Step ${step} of ${FORGE_MAX_STEPS}. Emit one command.`;
    messages.push({ role: "user", content: stepNote });

    // 9. Prior command log + prefill primer — single assistant message.
    //    Combining the pass log and prefill "[" into one message avoids
    //    consecutive assistant turns. The prefill "[" MUST be in the messages
    //    array sent to GLM so GLM generates the continuation (e.g. "CREATE...")
    //    rather than the full command (e.g. "[CREATE..."). The strategy's
    //    assistantPrefill then prepends "[" client-side to accumulatedText,
    //    giving the handler a fully-formed "[CREATE CHARACTER ...]" to parse.
    const passLog = buildForgePassLog(state, batchId);
    const prefill = step >= FORGE_MAX_STEPS ? "[CRITIQUE" : "[";
    const assistantContent = passLog ? `${passLog}\n${prefill}` : prefill;
    messages.push({ role: "assistant", content: assistantContent });

    return {
      messages,
      params: {
        model: await getModel(),
        max_tokens: 256,
        temperature: 0.85,
        min_p: 0.05,
      },
    };
  };
};

/**
 * Builds a GenerationStrategy for one step of the forge loop.
 */
export const buildForgeStrategy = (
  getState: () => RootState,
  batchId: string,
  step: number,
  forgeGuidance: string,
  brainstormContext?: string,
): GenerationStrategy => {
  const prefill = step >= FORGE_MAX_STEPS ? "[CRITIQUE" : "[";
  return {
    requestId: api.v1.uuid(),
    messageFactory: createForgeFactory(getState, batchId, step, forgeGuidance, brainstormContext ?? ""),
    target: {
      type: "forge",
      batchId,
      step,
      forgeGuidance,
      brainstormContext: brainstormContext ?? "",
    },
    prefillBehavior: "keep",
    assistantPrefill: prefill,
  };
};

export const DEFAULT_FORGE_PROMPT = `You are a world-building assistant operating in a step-by-step forge loop.

Each response emits exactly ONE command. Do not emit multiple commands.

Command vocabulary:
  [CREATE <TYPE> "<Name>"]       — new world element (CHARACTER, LOCATION, FACTION, SYSTEM, SITUATION, TOPIC)
  [REVISE "<Name>"]              — rewrite the description text of an existing draft element
  [LINK "<Name>" → "<Name>"]     — relationship between two elements
  [DELETE "<Name>"]              — remove a draft element
  [CRITIQUE]                     — self-assessment; ends this forge pass

After CREATE or REVISE, write the description text (1–3 sentences) on the following lines.
After LINK, write the relationship description on the following line.
After [CRITIQUE], write 2–4 sentences: what works, what is missing, what to address next.

There is no [DESCRIPTION] command. To update a character's description, use [REVISE "<Name>"].

The ESTABLISHED WORLD section lists what already exists — do not recreate those elements.
The prior command sequence shows what has been built this pass — continue it naturally.
When the draft feels complete, emit [CRITIQUE] to end the pass.`;
