/**
 * Context Builder - Strategy factories for GLM generation.
 *
 * UNIFIED PREFIX STRATEGY (for token cache efficiency):
 * All Story Engine strategies share a common prefix via buildStoryEnginePrefix():
 *
 *   MSG 1 (SYSTEM): systemPrompt + weaving prompt             [STABLE]
 *   MSG 2 (SYSTEM): story state snapshot (ATTG, style,        [STABLE during SEGA]
 *                    setting, brainstorm, canon)
 *   MSG 3 (SYSTEM): DULFS items                               [GROWS during list stage]
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
  GenerationStrategy,
} from "../store/types";
import { MessageFactory } from "nai-gen-x";
import {
  FieldID,
  FIELD_CONFIGS,
  DulfsFieldID,
} from "../../config/field-definitions";
// --- Helpers ---

const getFieldContent = (state: RootState, id: string): string => {
  return state.story.fields[id]?.content || "";
};

const getBrainstormHistory = (state: RootState): BrainstormMessage[] => {
  return state.brainstorm.messages || [];
};

/**
 * Extracts the name portion from a DULFS item content using field-specific parsing.
 * Falls back to raw content if no regex match.
 */
export const extractDulfsItemName = (
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
 * Gets existing DULFS item content for a field, joined with newlines.
 * Items are returned in creation order (array index order) for stable context.
 * Returns empty string if no items exist.
 */
export const getExistingDulfsItems = async (
  state: RootState,
  fieldId: DulfsFieldID,
): Promise<string> => {
  const items = state.story.dulfs[fieldId] || [];
  if (items.length === 0) return "";

  const contents: string[] = [];
  for (const item of items) {
    const content = String(
      (await api.v1.storyStorage.get(`dulfs-item-${item.id}`)) || "",
    );
    if (content) contents.push(content);
  }
  return contents.join("\n");
};

/**
 * All DULFS field IDs for iteration.
 */
const ALL_DULFS_FIELDS: DulfsFieldID[] = [
  FieldID.DramatisPersonae,
  FieldID.UniverseSystems,
  FieldID.Locations,
  FieldID.Factions,
  FieldID.SituationalDynamics,
];

/**
 * Gets all DULFS items across all fields, grouped by category label.
 * Categories are in fixed order (DP → US → Loc → Fac → SD).
 * Items within each category are in creation order (stable).
 * Returns formatted string for context injection.
 */
export const getAllDulfsContext = async (state: RootState): Promise<string> => {
  const sections: string[] = [];

  for (const fieldId of ALL_DULFS_FIELDS) {
    const items = await getExistingDulfsItems(state, fieldId);
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
  const { includeLorebookEntries = true, contextLimitReduction = 4000 } = options;

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
            for (let j = 0; j < content.length && normalizedPos < normalizedPrefill.length; j++) {
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
 *   MSG 3 (SYSTEM): DULFS items                               [GROWS during list stage]
 *   MSG 4 (SYSTEM): story text (rolling window)               [VOLATILE — at end]
 *
 * After the prefix, each factory appends its own volatile tail
 * (strategy-specific instructions, prefill, etc.).
 */
export interface StoryEnginePrefixOptions {
  /** Snapshot sections to exclude (e.g., "canon" when generating canon) */
  excludeSections?: Array<"canon" | "setting" | "attg" | "style" | "brainstorm" | "dulfs" | "storyText">;
}

export const buildStoryEnginePrefix = async (
  getState: () => RootState,
  options: StoryEnginePrefixOptions = {},
): Promise<Message[]> => {
  const state = getState();
  const excluded = new Set(options.excludeSections || []);

  // --- MSG 1: System prompt + weaving ---
  const systemPrompt = String(
    (await api.v1.config.get("system_prompt")) || "",
  );
  const weavingPrompt = String(
    (await api.v1.config.get("lorebook_weaving_prompt")) || "",
  );
  const msg1Content = weavingPrompt
    ? `${systemPrompt}\n\n${weavingPrompt}`
    : systemPrompt;

  // --- MSG 2: Story state snapshot (STABLE sections) ---
  // Order matches generation pipeline: ATTG/Style first (tone anchors),
  // then setting/brainstorm (foundational), then canon last (synthesis).
  const stableSections: string[] = [];

  // ATTG
  if (!excluded.has("attg")) {
    const attg = String(
      (await api.v1.storyStorage.get("kse-field-attg")) || "",
    );
    if (attg) stableSections.push(`[ATTG]\n${attg}`);
  }

  // Style
  if (!excluded.has("style")) {
    const style = String(
      (await api.v1.storyStorage.get("kse-field-style")) || "",
    );
    if (style) stableSections.push(`[STYLE]\n${style}`);
  }

  // Setting
  if (!excluded.has("setting")) {
    const setting = String(
      (await api.v1.storyStorage.get("kse-setting")) || "",
    );
    if (setting) stableSections.push(`[SETTING]\n${setting}`);
  }

  // Brainstorm (consolidated)
  if (!excluded.has("brainstorm")) {
    const brainstorm = getConsolidatedBrainstorm(state);
    if (brainstorm) stableSections.push(`[BRAINSTORM]\n${brainstorm}`);
  }

  // Canon (synthesis — last so it can reference all above sections)
  if (!excluded.has("canon")) {
    const canon = getFieldContent(state, FieldID.Canon);
    if (canon) stableSections.push(`[CANON]\n${canon}`);
  }

  // --- MSG 3: DULFS items (GROWS during list stage, stable during lorebook) ---
  // Separate message so growth doesn't invalidate MSG 2's cached tokens.
  let dulfsContent = "";
  if (!excluded.has("dulfs")) {
    const dulfsContext = await getAllDulfsContext(state);
    if (dulfsContext) dulfsContent = `[WORLD ENTRIES]\n${dulfsContext}`;
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
  const messages: Message[] = [
    { role: "system", content: msg1Content },
  ];

  if (stableSections.length > 0) {
    messages.push({
      role: "system",
      content: stableSections.join("\n\n"),
    });
  }

  if (dulfsContent) {
    messages.push({
      role: "system",
      content: dulfsContent,
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
  /** Include DULFS items (for chain, builder) */
  includeDulfs?: boolean;
  /** Include Setting + Canon if available (for intent derivation) */
  includeStoryState?: boolean;
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

  // --- MSG 1: Crucible system identity (hardcoded, not configurable) ---
  const messages: Message[] = [
    {
      role: "system",
      content:
        "You are a story structure architect working within the Crucible system — " +
        "a backward-chaining world generator. Your outputs are structural: scenes, " +
        "constraints, and world elements. Precision and constraint discipline " +
        "matter more than prose style.",
    },
  ];

  // --- MSG 2 (optional): Creative grounding ---
  const groundingSections: string[] = [];

  if (options.includeDirection && state.crucible.direction) {
    groundingSections.push(`[DIRECTION]\n${state.crucible.direction}`);
  }

  if (options.includeStoryState) {
    const setting = String(
      (await api.v1.storyStorage.get("kse-setting")) || "",
    );
    if (setting) groundingSections.push(`[SETTING]\n${setting}`);

    const canon = getFieldContent(state, FieldID.Canon);
    if (canon) groundingSections.push(`[CANON]\n${canon}`);
  }

  if (options.includeBrainstorm) {
    const brainstorm = getConsolidatedBrainstorm(state);
    if (brainstorm) groundingSections.push(`[BRAINSTORM]\n${brainstorm}`);
  }

  if (groundingSections.length > 0) {
    messages.push({
      role: "system",
      content: groundingSections.join("\n\n"),
    });
  }

  // --- MSG 3 (optional): DULFS items ---
  if (options.includeDulfs) {
    const dulfsContext = await getAllDulfsContext(state);
    if (dulfsContext) {
      messages.push({
        role: "system",
        content: `[WORLD ENTRIES]\n${dulfsContext}`,
      });
    }
  }

  return messages;
};

// --- Strategy Factories ---

/**
 * Creates a message factory for brainstorm generation.
 * The factory defers data fetching until execution time.
 */
export const createBrainstormFactory = (
  getState: () => RootState,
): MessageFactory => {
  return async () => {
    const state = getState();
    const model = "glm-4-6";
    const systemPrompt = String(
      (await api.v1.config.get("system_prompt")) || "",
    );
    const brainstormInstruction = String(
      (await api.v1.config.get("brainstorm_prompt")) || "",
    );

    const systemMsg: Message = {
      role: "system",
      content: `${systemPrompt}\n\nYou are now in brainstorming mode. ${brainstormInstruction}\n\nRespond naturally without echoing mode indicators or tags.`,
    };

    const messages: Message[] = [systemMsg];
    const storyContext = await getStoryContextMessages();
    messages.push(...storyContext);

    const canon = getFieldContent(state, FieldID.Canon);
    const setting = String(
      (await api.v1.storyStorage.get("kse-setting")) || "",
    );

    let contextBlock = "Here is the current state of the story:\n";
    let hasContext = false;

    if (canon) {
      contextBlock += `CANON:\n${canon}\n\n`;
      hasContext = true;
    }
    if (setting) {
      contextBlock += `SETTING:\n${setting}\n\n`;
      hasContext = true;
    }

    if (hasContext) {
      messages.push({
        role: "user",
        content: `${contextBlock}Let's brainstorm based on this context.`,
      });
      messages.push({
        role: "assistant",
        content:
          "Understood. I have the full story context in mind. Let's jam.",
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

    return {
      messages,
      params: { model, max_tokens: 300, temperature: 0.95, min_p: 0.05, presence_penalty: 0.05 },
    };
  };
};

/**
 * Builds a brainstorm generation strategy using JIT factory pattern.
 */
export const buildBrainstormStrategy = (
  getState: () => RootState,
  messageId: string,
): GenerationStrategy => {
  return {
    requestId: api.v1.uuid(),
    messageFactory: createBrainstormFactory(getState),
    target: {
      type: "brainstorm",
      messageId,
    },
    prefillBehavior: "keep",
  };
};

/**
 * Creates a message factory for Canon generation.
 * Uses unified prefix + volatile tail with canon-specific instruction.
 */
export const createCanonFactory = (
  getState: () => RootState,
): MessageFactory => {
  return async () => {
    const model = "glm-4-6";
    const prompt = String(
      (await api.v1.config.get("canon_generate_prompt")) || "",
    );

    // Exclude canon (generating it — prevents self-reference)
    const prefix = await buildStoryEnginePrefix(getState, {
      excludeSections: ["canon"],
    });

    const messages: Message[] = [
      ...prefix,
      {
        role: "system",
        content: `[CANON GENERATION]\n${prompt}`,
      },
      {
        role: "assistant",
        content: "**World:**",
      },
    ];

    return {
      messages,
      params: {
        model,
        temperature: 0.9,
        min_p: 0.05,
        presence_penalty: 0.1,
        max_tokens: 600,
      },
      contextPinning: { head: 1, tail: 2 },
    };
  };
};

/**
 * Builds a Canon generation strategy using JIT factory pattern.
 */
export const buildCanonStrategy = (
  getState: () => RootState,
  fieldId: FieldID,
): GenerationStrategy => {
  return {
    requestId: api.v1.uuid(),
    messageFactory: createCanonFactory(getState),
    target: { type: "field", fieldId },
    prefillBehavior: "trim",
  };
};

/**
 * Creates a message factory for DULFS list generation.
 * Uses unified prefix + volatile tail with list-specific instruction.
 */
export const createDulfsListFactory = (
  getState: () => RootState,
  fieldId: string,
): MessageFactory => {
  return async () => {
    const state = getState();
    const model = "glm-4-6";
    const fieldConfig = FIELD_CONFIGS.find((f) => f.id === fieldId);

    const instruction =
      fieldConfig?.listGenerationInstruction ||
      fieldConfig?.generationInstruction ||
      "";
    const exampleFormat = fieldConfig?.exampleFormat || "";

    // Get existing items in full format to avoid duplicates
    const existingItems = await getExistingDulfsItems(
      state,
      fieldId as DulfsFieldID,
    );
    const existingContext = existingItems
      ? `\n\n[EXISTING ${fieldConfig?.label?.toUpperCase() || "ITEMS"}]\n${existingItems}\n\nDo not repeat any of the above characters/items.`
      : "";

    const prefix = await buildStoryEnginePrefix(getState);

    const messages: Message[] = [
      ...prefix,
      {
        role: "system",
        content: `[LIST GENERATION]\n${instruction}\n\nOutput a bulleted list. Each item is ONE LINE — name and a terse summary clause. No prose, no atmosphere, no history.\nFormat:\n${exampleFormat}`,
      },
      {
        role: "user",
        content: existingContext.trim() || "Generate items.",
      },
      { role: "assistant", content: "-" },
    ];

    return {
      messages,
      params: { model, max_tokens: 350, temperature: 0.8, min_p: 0.1 },
      contextPinning: { head: 1, tail: 3 },
    };
  };
};

/**
 * Builds a DULFS list generation strategy using JIT factory pattern.
 */
export const buildDulfsListStrategy = (
  getState: () => RootState,
  fieldId: string,
): GenerationStrategy => {
  return {
    requestId: api.v1.uuid(),
    messageFactory: createDulfsListFactory(getState, fieldId),
    target: { type: "list", fieldId },
    prefillBehavior: "trim",
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
    const model = "glm-4-6";
    const prompt = String(
      (await api.v1.config.get("attg_generate_prompt")) || "",
    );

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
      { role: "assistant", content: "[" },
    ];

    return {
      messages,
      params: { model, max_tokens: 128, temperature: 0.7, min_p: 0.05 },
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
    const model = "glm-4-6";
    const prompt = String(
      (await api.v1.config.get("style_generate_prompt")) || "",
    );

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
      { role: "assistant", content: "[" },
    ];

    return {
      messages,
      params: { model, max_tokens: 128, temperature: 0.8, min_p: 0.05 },
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

/**
 * Story opening techniques for GLM to select from.
 */
const STORY_OPENING_TECHNIQUES = `[STORY OPENING TECHNIQUES]
- In Media Res: Begin mid-action, context revealed through unfolding events
- Inciting Incident: The catalyst that disrupts the status quo
- Character-Driven: Open with character revealing personality through action
- Atmospheric/Tone: Establish mood, voice, and setting atmosphere first
- Mystery Hook: Open with an intriguing question or anomaly
- Dramatic Irony: Reader knows something the characters don't
- Sensory Immersion: World-building through vivid sensory detail
- Dialogue Hook: Open with compelling conversation that reveals stakes
- Thematic Statement: Encapsulate the core theme in the opening
- Frame Narrative: Narrator reflecting on events to come`;

/**
 * Creates a message factory for Bootstrap generation.
 * Uses unified prefix + volatile tail with bootstrap-specific task instruction.
 */
export const createBootstrapFactory = (
  getState: () => RootState,
): MessageFactory => {
  return async () => {
    const model = "glm-4-6";

    const prefix = await buildStoryEnginePrefix(getState);

    const bootstrapTask = `You are a creative writing assistant specializing in story openings.

${STORY_OPENING_TECHNIQUES}

[TASK]
Analyze the story state provided above.
Select 1-2 appropriate opening techniques based on the story's nature.

Generate a SELF-CONTAINED instruction block that includes:

1. [BACKGROUND] (inline context the story LLM needs):
   - World/setting essentials (era, tone, key rules)
   - POV character with key traits, motivation, and appearance
   - Any factions, locations, or world systems relevant to the opening scene

2. [SCENE INSTRUCTION] (imperative voice directives):
   - Where and when the scene begins
   - What tension or narrative vector to pursue
   - Concrete sensory details or action beats to open with
   - What the POV character is doing/feeling

The instruction must work STANDALONE. The story LLM may not have detailed lorebook entries yet - include all necessary context within the instruction itself.

IMPORTANT: Do NOT use hash/pound signs in your output. Use bracketed labels like [SECTION] instead of markdown headers.`;

    const messages: Message[] = [
      ...prefix,
      {
        role: "system",
        content: bootstrapTask,
      },
      {
        role: "user",
        content: "Generate a self-contained opening scene instruction.",
      },
      {
        role: "assistant",
        content: "[SCENE OPENING]\nTechnique:",
      },
    ];

    return {
      messages,
      params: {
        model,
        max_tokens: 1024,
        temperature: 0.85,
        min_p: 0.05,
        presence_penalty: 0.1,
      },
      contextPinning: { head: 1, tail: 3 },
    };
  };
};

/**
 * Builds a Bootstrap generation strategy using JIT factory pattern.
 */
export const buildBootstrapStrategy = (
  getState: () => RootState,
  requestId: string,
): GenerationStrategy => {
  return {
    requestId,
    messageFactory: createBootstrapFactory(getState),
    target: { type: "bootstrap" },
    prefillBehavior: "keep",
    assistantPrefill: "[SCENE OPENING]\nTechnique:",
  };
};
