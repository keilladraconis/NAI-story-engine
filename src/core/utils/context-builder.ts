/**
 * Context Builder - Strategy factories for GLM generation.
 *
 * UNIFIED PREFIX STRATEGY (for token cache efficiency):
 * All Story Engine strategies share a common prefix via buildStoryEnginePrefix():
 *
 *   MSG 1 (SYSTEM): systemPrompt + weaving prompt             [STABLE]
 *   MSG 2 (SYSTEM): story state snapshot (ATTG, style,        [STABLE during SEGA]
 *                    setting, brainstorm, canon)
 *   MSG 3 (SYSTEM): World Entry items                               [GROWS during list stage]
 *   MSG 4 (SYSTEM): story text (rolling window)               [VOLATILE — at end]
 *   ─── cache boundary ───
 *   MSG 5+ : strategy-specific instructions                   [VOLATILE]
 *   LAST   : assistant prefill                                [VOLATILE]
 *
 * Brainstorm mode is excluded — it uses chat-based context (createBrainstormFactory).
 */

import {
  RootState,
  BrainstormMessage,
  BrainstormMode,
  GenerationStrategy,
} from "../store/types";
import { currentMessages } from "../store/slices/brainstorm";
import { MessageFactory } from "nai-gen-x";
import {
  FieldID,
  FIELD_CONFIGS,
  DulfsFieldID,
} from "../../config/field-definitions";
import { formatWorldState } from "./crucible-world-formatter";
import { STORAGE_KEYS } from "../../ui/framework/ids";
import { buildModelParams, appendXialongStyleMessage } from "./config";
import {
  SYSTEM_PROMPT,
  LOREBOOK_WEAVING_PROMPT,
  CRUCIBLE_SYSTEM_PROMPT,
  BRAINSTORM_PROMPT,
  BRAINSTORM_CRITIC_PROMPT,
  BRAINSTORM_SUMMARIZE_PROMPT,
  ATTG_GENERATE_PROMPT,
  STYLE_GENERATE_PROMPT,
  XIALONG_STYLE,
} from "./prompts";
// --- Helpers ---


const getBrainstormHistory = (state: RootState): BrainstormMessage[] => {
  return currentMessages(state.brainstorm) || [];
};

/**
 * Extracts the name portion from a World Entry item content using field-specific parsing.
 * Falls back to raw content if no regex match.
 */
export const extractEntityName = (
  content: string,
  fieldId: string,
): string => {
  const fieldConfig = FIELD_CONFIGS.find((f) => f.id === fieldId);
  const regex = fieldConfig?.parsingRegex;

  if (regex) {
    const match = content.match(regex);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  // Fallback: return content up to first colon or full content
  const colonIndex = content.indexOf(":");
  if (colonIndex > 0) {
    return content.substring(0, colonIndex).trim();
  }
  return content.trim();
};

/**
 * Build a context-aware Xialong [ Style: ] guidance block for Style field generation.
 * Derives narrative style tags from shape, intent, and shape description — actual
 * writing-style descriptors (slow-burn, visceral, methodical) rather than role tags.
 */
export function buildXialongNarrativeStyleBlock(state: RootState): string {
  const tags: string[] = [];
  const { shape, intent } = state.foundation ?? {};

  // Shape name as primary style indicator
  if (shape?.name) {
    const shapeName = shape.name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\s+/g, "-")
      .slice(0, 30);
    if (shapeName) tags.push(shapeName);
  }

  // Derive additional tags from intent + shape description
  const context = [intent ?? "", shape?.description ?? ""]
    .join(" ")
    .toLowerCase();

  const markers: [RegExp, string][] = [
    [/slow.burn|deliberate|unhurried|gradual|patient/, "slow-burn"],
    [/methodical|structured|systematic|meticul/, "methodical"],
    [/subtle|understated|implied|nuanced/, "subtle"],
    [/dark|grim|bleak|harsh|brutal/, "dark"],
    [/trauma|ptsd|grief|loss|wound|scar/, "raw"],
    [/sensory|visceral|body|flesh|taste|smell|touch/, "sensory"],
    [/psycholog|mental|interior|introspect/, "psychological"],
    [/intimate|personal|close|private/, "intimate"],
    [/lyric|poetic|prose-poem/, "lyrical"],
    [/epic|grand|sweep|vast|myth/, "expansive"],
    [/tense|thriller|suspense/, "tense"],
    [/comedy|humor|wit|irony|satir/, "sardonic"],
    [/romance|longing|desire|passion|eros/, "yearning"],
    [/horror|terror|dread|uncanny/, "dread"],
    [/action|kinetic|fast.pac|violent|combat/, "kinetic"],
    [/fragment|non.linear|discontinu|elliptic/, "fragmentary"],
  ];

  for (const [pattern, tag] of markers) {
    if (pattern.test(context) && !tags.includes(tag)) {
      tags.push(tag);
      if (tags.length >= 4) break;
    }
  }

  if (tags.length === 0) tags.push("literary", "considered");

  return `[ Style: ${tags.join(", ")} ]`;
}

/**
 * Gets existing WorldEntity summaries for a field, joined with newlines.
 * Returns empty string if no entities exist for the given field.
 */
export const getExistingEntityItems = (
  state: RootState,
  fieldId: DulfsFieldID,
): string => {
  const entities = Object.values(state.world.entitiesById).filter(
    (e) => e.categoryId === fieldId,
  );
  if (entities.length === 0) return "";
  return entities
    .filter((e) => e.summary)
    .map((e) => e.summary)
    .join("\n");
};

/**
 * All World Entry field IDs for iteration.
 */
const ALL_ENTITY_FIELDS: DulfsFieldID[] = [
  FieldID.DramatisPersonae,
  FieldID.UniverseSystems,
  FieldID.Locations,
  FieldID.Factions,
  FieldID.SituationalDynamics,
  FieldID.Topics,
];

/**
 * Gets all WorldEntity summaries grouped by category label.
 * Categories are in fixed order (DP → US → Loc → Fac → SD → Topics).
 * Returns formatted string for context injection.
 */
export const getAllWorldEntityContext = (state: RootState): string => {
  const sections: string[] = [];

  for (const fieldId of ALL_ENTITY_FIELDS) {
    const items = getExistingEntityItems(state, fieldId);
    if (items) {
      const config = FIELD_CONFIGS.find((f) => f.id === fieldId);
      const label = config?.label || fieldId;
      sections.push(`[${label.toUpperCase()}]\n${items}`);
    }
  }

  return sections.join("\n\n");
};

export const getConsolidatedBrainstorm = (state: RootState): string => {
  const history = getBrainstormHistory(state);
  if (history.length > 0) {
    return history
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join("\n");
  }
  return "";
};

/**
 * Options for getStoryContextMessages.
 */
export interface StoryContextOptions {
  /** Include lorebook entries (system messages). Default: true */
  includeLorebookEntries?: boolean;
  /** Context limit reduction for buildContext. Default: 4000 */
  contextLimitReduction?: number;
}

/**
 * Gets story context messages from the current story state.
 * Filters out user messages, Author's Note, and optionally lorebook entries.
 * Cleans prefill from assistant messages.
 */
export const getStoryContextMessages = async (
  options: StoryContextOptions = {},
): Promise<Message[]> => {
  const { includeLorebookEntries = true, contextLimitReduction = 4000 } =
    options;

  try {
    const messages = await api.v1.buildContext({ contextLimitReduction });
    const prefill = await api.v1.prefill.get();
    const authorsNote = await api.v1.an.get();

    // First message is always systemPrompt - skip it
    // Keep system messages (lorebook entries) but filter out Author's Note
    // Filter out user messages (user-written instructions)
    // Clean prefill from the last assistant message
    const filtered: Message[] = [];

    for (let i = 1; i < messages.length; i++) {
      const msg = messages[i];

      if (msg.role === "user") {
        // Skip user-written instructions
        continue;
      }

      if (msg.role === "system") {
        // Filter out Author's Note from system messages
        const content = msg.content || "";
        if (authorsNote && content === authorsNote) {
          continue;
        }
        // Optionally filter out lorebook entries (system messages)
        if (!includeLorebookEntries) {
          continue;
        }
        // Keep other system messages (lorebook entries)
        filtered.push(msg);
        continue;
      }

      if (msg.role === "assistant") {
        // Strip prefill from assistant message content
        let content = msg.content || "";

        if (prefill) {
          // Normalize whitespace for comparison (collapse multiple newlines)
          const normalizeWs = (s: string) => s.replace(/\n{2,}/g, "\n");
          const normalizedPrefill = normalizeWs(prefill);
          const normalizedContent = normalizeWs(content);

          if (normalizedContent.startsWith(normalizedPrefill)) {
            // Find where to cut in original content by matching normalized positions
            // Walk through original content, tracking normalized position
            let normalizedPos = 0;
            let cutIndex = 0;
            for (
              let j = 0;
              j < content.length && normalizedPos < normalizedPrefill.length;
              j++
            ) {
              const char = content[j];
              // Skip extra newlines (those that get collapsed in normalization)
              if (char === "\n" && j > 0 && content[j - 1] === "\n") {
                cutIndex = j + 1;
                continue;
              }
              normalizedPos++;
              cutIndex = j + 1;
            }
            content = content.slice(cutIndex).trim();
          }
        }

        if (content) {
          filtered.push({ ...msg, content });
        }
      }
    }

    return filtered;
  } catch {
    return [];
  }
};

// --- Unified Story Engine Prefix ---

/**
 * Builds the shared message prefix for all Story Engine generation strategies.
 * Brainstorm mode is excluded — it uses its own chat-based context.
 *
 * Prefix structure:
 *   MSG 1 (SYSTEM): systemPrompt + weaving prompt             [STABLE]
 *   MSG 2 (SYSTEM): story state snapshot (ATTG, style,        [STABLE during SEGA]
 *                    setting, brainstorm, canon)
 *   MSG 3 (SYSTEM): World Entry items                               [GROWS during list stage]
 *   MSG 4 (SYSTEM): story text (rolling window)               [VOLATILE — at end]
 *
 * After the prefix, each factory appends its own volatile tail
 * (strategy-specific instructions, prefill, etc.).
 */
export interface StoryEnginePrefixOptions {
  /** Snapshot sections to exclude (e.g., "foundation" when generating foundation fields) */
  excludeSections?: Array<
    | "setting"
    | "attg"
    | "style"
    | "brainstorm"
    | "worldEntities"
    | "storyText"
    | "foundation"
  >;
}

export const buildStoryEnginePrefix = async (
  getState: () => RootState,
  options: StoryEnginePrefixOptions = {},
): Promise<Message[]> => {
  const state = getState();
  const excluded = new Set(options.excludeSections || []);

  // --- MSG 1: System prompt + weaving ---
  const systemPrompt = SYSTEM_PROMPT;
  const weavingPrompt = LOREBOOK_WEAVING_PROMPT;
  const msg1Content = weavingPrompt
    ? `${systemPrompt}\n\n${weavingPrompt}`
    : systemPrompt;

  // --- MSG 2: Story state snapshot (STABLE sections) ---
  // Order: Foundation (tone/intent anchors), then setting/brainstorm, then canon.
  const stableSections: string[] = [];

  // ATTG — read from v11 foundation state (populated via NarrativeFoundation onChange)
  if (!excluded.has("attg")) {
    const attg = state.foundation.attg;
    if (attg) stableSections.push(`[ATTG]\n${attg}`);
  }

  // Style — read from v11 foundation state
  if (!excluded.has("style")) {
    const style = state.foundation.style;
    if (style) stableSections.push(`[STYLE]\n${style}`);
  }

  // Foundation context (shape, intent, worldState, intensity, contract)
  if (!excluded.has("foundation")) {
    const { shape, intent, worldState, intensity, contract } = state.foundation;
    const foundationParts: string[] = [];
    if (shape)
      foundationParts.push(`Shape: ${shape.name}\n${shape.description}`);
    if (intent) foundationParts.push(`Intent: ${intent}`);
    if (worldState) foundationParts.push(`World State: ${worldState}`);
    if (intensity)
      foundationParts.push(`Intensity: ${intensity.level} — ${intensity.description}`);
    if (contract) {
      const contractLines = [
        `Required: ${contract.required}`,
        `Prohibited: ${contract.prohibited}`,
        `Emphasis: ${contract.emphasis}`,
      ].join("\n");
      foundationParts.push(`Story Contract:\n${contractLines}`);
    }
    if (foundationParts.length > 0) {
      stableSections.push(
        `[NARRATIVE FOUNDATION]\n${foundationParts.join("\n")}`,
      );
    }
  }

  // Setting
  if (!excluded.has("setting")) {
    const setting = String(
      (await api.v1.storyStorage.get(STORAGE_KEYS.SETTING)) || "",
    );
    if (setting) stableSections.push(`[SETTING]\n${setting}`);
  }

  // Brainstorm (consolidated)
  if (!excluded.has("brainstorm")) {
    const brainstorm = getConsolidatedBrainstorm(state);
    if (brainstorm) stableSections.push(`[BRAINSTORM]\n${brainstorm}`);
  }

  // --- MSG 3: World Entities (GROWS during list stage, stable during lorebook) ---
  // Separate message so growth doesn't invalidate MSG 2's cached tokens.
  let worldEntityContent = "";
  if (!excluded.has("worldEntities")) {
    const entityContext = getAllWorldEntityContext(state);
    if (entityContext) worldEntityContent = `[WORLD ENTRIES]\n${entityContext}`;
  }

  // --- MSG 4: Story text (VOLATILE — at end of prefix) ---
  // Placed last so frequent changes don't bust cache for stable sections above.
  let storyTextContent = "";
  if (!excluded.has("storyText")) {
    const storyMessages = await getStoryContextMessages({
      includeLorebookEntries: false,
      contextLimitReduction: 8000,
    });
    const storyText = storyMessages
      .filter((m) => m.role === "assistant")
      .map((m) => m.content)
      .join("\n\n");
    if (storyText) storyTextContent = `[STORY TEXT]\n${storyText}`;
  }

  // --- Assemble prefix ---
  const messages: Message[] = [{ role: "system", content: msg1Content }];

  if (stableSections.length > 0) {
    messages.push({
      role: "system",
      content: stableSections.join("\n\n"),
    });
  }

  if (worldEntityContent) {
    messages.push({
      role: "system",
      content: worldEntityContent,
    });
  }

  if (storyTextContent) {
    messages.push({
      role: "system",
      content: storyTextContent,
    });
  }

  return messages;
};

// --- Crucible Prefix ---

/**
 * Options for buildCruciblePrefix — isolated context for all Crucible factories.
 * Crucible uses its own system identity and only includes what each factory needs.
 */
export interface CruciblePrefixOptions {
  /** Include brainstorm history (for intent derivation) */
  includeBrainstorm?: boolean;
  /** Include the crucible direction/intent text */
  includeDirection?: boolean;
  /** Include World Entry items (for chain, builder) */
  includeWorldEntities?: boolean;
  /** Include Setting + Canon if available (for intent derivation) */
  includeStoryState?: boolean;
  /** Include accepted tensions as [TENSIONS] section */
  includeTensions?: boolean;
  /** Include formatted crucible world state (elements, links, critique) */
  includeWorldState?: boolean;
}

/**
 * Builds a focused message prefix for Crucible generation strategies.
 * Unlike buildStoryEnginePrefix, this uses a hardcoded structural identity
 * and only includes context relevant to the specific Crucible phase.
 *
 * NO lorebook weaving. NO story text. NO ATTG. NO Style.
 */
export const buildCruciblePrefix = async (
  getState: () => RootState,
  options: CruciblePrefixOptions = {},
): Promise<Message[]> => {
  const state = getState();

  // --- MSG 1: Crucible system identity ---
  const systemPrompt = CRUCIBLE_SYSTEM_PROMPT;
  const messages: Message[] = [{ role: "system", content: systemPrompt }];

  // --- MSG 2 (optional): Creative grounding ---
  const groundingSections: string[] = [];

  if (options.includeDirection && state.crucible.direction) {
    groundingSections.push(`[DIRECTION]\n${state.crucible.direction}`);
  }

  if (options.includeStoryState) {
    const setting = String(
      (await api.v1.storyStorage.get(STORAGE_KEYS.SETTING)) || "",
    );
    if (setting) groundingSections.push(`[SETTING]\n${setting}`);

  }

  if (options.includeBrainstorm) {
    const brainstorm = getConsolidatedBrainstorm(state);
    if (brainstorm) groundingSections.push(`[BRAINSTORM]\n${brainstorm}`);
  }

  // Tensions
  if (options.includeTensions) {
    const accepted = state.crucible.tensions.filter((t) => t.accepted);
    if (accepted.length > 0) {
      const tensionLines = accepted.map((t) => `- ${t.text}`).join("\n");
      groundingSections.push(`[TENSIONS]\n${tensionLines}`);
    }
  }

  if (groundingSections.length > 0) {
    messages.push({
      role: "system",
      content: groundingSections.join("\n\n"),
    });
  }

  // --- Optional: Crucible world state (elements, links, critique) ---
  if (options.includeWorldState) {
    const worldState = formatWorldState(state.crucible);
    if (worldState) {
      messages.push({ role: "system", content: worldState });
    }
  }

  // --- MSG 3 (optional): World Entities ---
  if (options.includeWorldEntities) {
    const entityContext = getAllWorldEntityContext(state);
    if (entityContext) {
      messages.push({
        role: "system",
        content: `[WORLD ENTRIES]\n${entityContext}`,
      });
    }
  }

  return messages;
};

// --- Strategy Factories ---

/**
 * Creates a message factory for brainstorm generation.
 * The factory defers data fetching until execution time.
 * Mode selects the persona prompt: cowriter (default) or critic.
 */
export const createBrainstormFactory = (
  getState: () => RootState,
  mode?: BrainstormMode,
): MessageFactory => {
  return async () => {
    const state = getState();
    const brainstormInstruction =
      mode === "critic" ? BRAINSTORM_CRITIC_PROMPT : BRAINSTORM_PROMPT;

    const systemMsg: Message = {
      role: "system",
      content: `${SYSTEM_PROMPT}\n\nYou are now in brainstorming mode. ${brainstormInstruction}\n\nRespond naturally without echoing mode indicators or tags.`,
    };

    const messages: Message[] = [systemMsg];
    const storyContext = await getStoryContextMessages();
    messages.push(...storyContext);

    const setting = String(
      (await api.v1.storyStorage.get(STORAGE_KEYS.SETTING)) || "",
    );

    const { shape, intent, worldState, intensity, contract } = state.foundation;
    const entities = state.world.entityIds
      .map((id) => state.world.entitiesById[id])
      .filter((e) => e?.summary);

    let contextBlock = "Here is the current state of the story:\n";
    let hasContext = false;

    if (setting) {
      contextBlock += `SETTING:\n${setting}\n\n`;
      hasContext = true;
    }
    if (intensity) {
      contextBlock += `INTENSITY: ${intensity.level} — ${intensity.description}\n\n`;
      hasContext = true;
    }
    if (shape) {
      contextBlock += `SHAPE: ${shape.name}: ${shape.description}\n\n`;
      hasContext = true;
    }
    if (intent) {
      contextBlock += `INTENT:\n${intent}\n\n`;
      hasContext = true;
    }
    if (worldState) {
      contextBlock += `WORLD STATE:\n${worldState}\n\n`;
      hasContext = true;
    }
    if (contract) {
      contextBlock += `STORY CONTRACT:\nRequired: ${contract.required}\nProhibited: ${contract.prohibited}\nEmphasis: ${contract.emphasis}\n\n`;
      hasContext = true;
    }
    if (entities.length > 0) {
      contextBlock += `CHARACTERS & ENTITIES:\n`;
      for (const e of entities) {
        contextBlock += `- ${e.name} (${e.categoryId}): ${e.summary}\n`;
      }
      contextBlock += "\n";
      hasContext = true;
    }

    if (hasContext) {
      messages.push({
        role: "user",
        content: `${contextBlock}Let's brainstorm based on this context.`,
      });
      messages.push({
        role: "assistant",
        content: "Understood. I have the full story context in mind. Ready.",
      });
    }

    const history = getBrainstormHistory(state);
    const cleanHistory = history.filter(
      (m) => !(m.role === "assistant" && !m.content.trim()),
    );
    const historyMessages: Message[] = cleanHistory.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    messages.push(...historyMessages);

    // Style block as the final message before model responds — signals chat mode
    // to prevent Xialong from switching into story-writing mode.
    await appendXialongStyleMessage(
      messages,
      mode === "critic" ? XIALONG_STYLE.brainstormCritic : XIALONG_STYLE.brainstorm,
    );

    return {
      messages,
      params: await buildModelParams({
        max_tokens: 400,
        temperature: 0.95,
        min_p: 0.05,
        presence_penalty: 0.05,
      }),
    };
  };
};

/**
 * Builds a brainstorm generation strategy using JIT factory pattern.
 */
export const buildBrainstormStrategy = (
  getState: () => RootState,
  messageId: string,
  mode?: BrainstormMode,
): GenerationStrategy => {
  return {
    requestId: api.v1.uuid(),
    messageFactory: createBrainstormFactory(getState, mode),
    target: {
      type: "brainstorm",
      messageId,
    },
    prefillBehavior: "keep",
  };
};

/**
 * Creates a message factory for summarize generation.
 * Captures chat history at creation time (before messages are cleared).
 */
export const createSummarizeFactory = (
  chatHistory: BrainstormMessage[],
): MessageFactory => {
  return async () => {
    const systemMsg: Message = {
      role: "system",
      content: `${SYSTEM_PROMPT}\n\n${BRAINSTORM_SUMMARIZE_PROMPT}`,
    };

    const messages: Message[] = [systemMsg];

    // Replay the captured chat history
    const chatText = chatHistory
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join("\n");
    messages.push({
      role: "user",
      content: `Brainstorm transcript:\n\n${chatText}\n\nStart your response with the "## World" section.`,
    });

    return {
      messages,
      params: await buildModelParams({ max_tokens: 1024, temperature: 0.5, min_p: 0.05 }),
    };
  };
};

/**
 * Creates a message factory for brainstorm chat title generation.
 * Captures chat history at creation time and produces a short evocative title.
 */
export const createBrainstormTitleFactory = (
  chatHistory: BrainstormMessage[],
): MessageFactory => {
  return async () => {
    const chatText = chatHistory
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join("\n");

    const messages: Message[] = [
      {
        role: "system",
        content: `${SYSTEM_PROMPT}\n\nYou are a creative assistant. Given a brainstorm conversation, output a short evocative title (3–6 words) that captures the core theme or subject. Output ONLY the title — no punctuation at the end, no quotes, no explanation.`,
      },
      {
        role: "user",
        content: `Brainstorm conversation:\n\n${chatText}\n\nGenerate a short title for this conversation.`,
      },
    ];

    return {
      messages,
      params: await buildModelParams({ max_tokens: 20, temperature: 0.8, min_p: 0.05 }),
    };
  };
};

/**
 * Builds a brainstorm chat title generation strategy.
 * On completion, dispatches chatRenamed for the given chat index.
 */
export const buildBrainstormTitleStrategy = (
  chatIndex: number,
  chatHistory: BrainstormMessage[],
): GenerationStrategy => {
  return {
    requestId: api.v1.uuid(),
    messageFactory: createBrainstormTitleFactory(chatHistory),
    target: { type: "brainstormChatTitle", chatIndex },
    prefillBehavior: "trim",
  };
};

/**
 * Builds a summarize generation strategy.
 */
export const buildSummarizeStrategy = (
  messageId: string,
  chatHistory: BrainstormMessage[],
): GenerationStrategy => {
  return {
    requestId: api.v1.uuid(),
    messageFactory: createSummarizeFactory(chatHistory),
    target: {
      type: "brainstorm",
      messageId,
    },
    prefillBehavior: "keep",
    continuation: { maxCalls: 3 },
  };
};


/**
 * Creates a message factory for ATTG generation.
 * Uses unified prefix + volatile tail with ATTG-specific instruction.
 */
export const createATTGFactory = (
  getState: () => RootState,
): MessageFactory => {
  return async () => {
    const prompt = ATTG_GENERATE_PROMPT;

    // Exclude ATTG (generating it)
    const prefix = await buildStoryEnginePrefix(getState, {
      excludeSections: ["attg"],
    });

    const messages: Message[] = [
      ...prefix,
      {
        role: "system",
        content: `[ATTG GENERATION]\n${prompt}`,
      },
    ];

    await appendXialongStyleMessage(messages, XIALONG_STYLE.attg);
    messages.push({ role: "assistant", content: "[" });

    return {
      messages,
      params: await buildModelParams({ max_tokens: 128, temperature: 0.7, min_p: 0.05 }),
      contextPinning: { head: 1, tail: 2 },
    };
  };
};

/**
 * Builds an ATTG generation strategy using JIT factory pattern.
 */
export const buildATTGStrategy = (
  getState: () => RootState,
): GenerationStrategy => {
  return {
    requestId: api.v1.uuid(),
    messageFactory: createATTGFactory(getState),
    target: { type: "field", fieldId: FieldID.ATTG },
    prefillBehavior: "keep",
    assistantPrefill: "[",
  };
};

/**
 * Creates a message factory for Style generation.
 * Uses unified prefix + volatile tail with style-specific instruction.
 */
export const createStyleFactory = (
  getState: () => RootState,
): MessageFactory => {
  return async () => {
    const prompt = STYLE_GENERATE_PROMPT;

    // Exclude style (generating it)
    const prefix = await buildStoryEnginePrefix(getState, {
      excludeSections: ["style"],
    });

    const messages: Message[] = [
      ...prefix,
      {
        role: "system",
        content: `[STYLE GENERATION]\n${prompt}`,
      },
    ];

    await appendXialongStyleMessage(messages, buildXialongNarrativeStyleBlock(getState()));
    messages.push({ role: "assistant", content: "[" });

    return {
      messages,
      params: await buildModelParams({ max_tokens: 128, temperature: 0.8, min_p: 0.05 }),
      contextPinning: { head: 1, tail: 2 },
    };
  };
};

/**
 * Builds a Style generation strategy using JIT factory pattern.
 */
export const buildStyleStrategy = (
  getState: () => RootState,
): GenerationStrategy => {
  return {
    requestId: api.v1.uuid(),
    messageFactory: createStyleFactory(getState),
    target: { type: "field", fieldId: FieldID.Style },
    prefillBehavior: "keep",
    assistantPrefill: "[",
  };
};

