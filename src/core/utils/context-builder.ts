import {
  RootState,
  BrainstormMessage,
  GenerationStrategy,
} from "../store/types";
import { MessageFactory } from "../../../lib/gen-x";
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

const getConsolidatedBrainstorm = (state: RootState): string => {
  const history = getBrainstormHistory(state);
  if (history.length > 0) {
    return history
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join("\n");
  }
  return "";
};

const contextBuilder = (
  system: Message,
  user: Message,
  assistant: Message,
  rest: Message[],
): Message[] => {
  const clean = (m: Message): Message => ({
    ...m,
    content: m.content ? m.content.trim() : m.content,
  });
  return [clean(system), ...rest.map(clean), clean(user), clean(assistant)];
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
 * Note: Canon generation excludes existing Canon from context (can't reference itself).
 */
export const createCanonFactory = (
  getState: () => RootState,
): MessageFactory => {
  return async () => {
    const state = getState();
    const model = "glm-4-6";
    const systemPrompt = String(
      (await api.v1.config.get("system_prompt")) || "",
    );
    const prompt = String(
      (await api.v1.config.get("canon_generate_prompt")) || "",
    );
    const brainstormContent = getConsolidatedBrainstorm(state);
    const storyContext = await getStoryContextMessages();
    const setting = String((await api.v1.storyStorage.get("kse-setting")) || "");

    // Build context without Canon (we're generating it)
    const contextBlocks: Message[] = [
      ...storyContext,
      ...(setting ? [{ role: "user" as const, content: `SETTING:\n${setting}` }] : []),
    ];

    const messages = contextBuilder(
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt },
      {
        role: "assistant",
        content: "Here is the canon extracted from our brainstorming session:",
      },
      [
        ...contextBlocks,
        { role: "user", content: `BRAINSTORM MATERIAL:\n${brainstormContent}` },
      ],
    );

    return {
      messages,
      params: {
        model,
        temperature: 1.1,
        min_p: 0.05,
        presence_penalty: 0.1,
        max_tokens: 1024,
      },
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
 */
export const createDulfsListFactory = (
  getState: () => RootState,
  fieldId: string,
): MessageFactory => {
  return async () => {
    const state = getState();
    const model = "glm-4-6";
    const systemPrompt = String(
      (await api.v1.config.get("system_prompt")) || "",
    );
    const fieldConfig = FIELD_CONFIGS.find((f) => f.id === fieldId);

    // Use generationInstruction for rich format, listGenerationInstruction for context
    const instruction =
      fieldConfig?.listGenerationInstruction ||
      fieldConfig?.generationInstruction ||
      "";
    const exampleFormat = fieldConfig?.exampleFormat || "";
    const brainstormContent = getConsolidatedBrainstorm(state);
    const canon = getFieldContent(state, FieldID.Canon);

    // Get existing items in full format to avoid duplicates
    const existingItems = await getExistingDulfsItems(
      state,
      fieldId as DulfsFieldID,
    );
    const existingContext = existingItems
      ? `\n\n[EXISTING ${fieldConfig?.label?.toUpperCase() || "ITEMS"}]\n${existingItems}\n\nDo not repeat any of the above characters/items.`
      : "";

    const messages: Message[] = [
      {
        role: "system",
        content: `${systemPrompt}\n\n[LIST GENERATION MODE]\n${instruction}\n\nOutput a bulleted list. Each item should follow this format:\n${exampleFormat}`,
      },
      {
        role: "user",
        content: `CANON:\n${canon}\n\nBRAINSTORM:\n${brainstormContent}${existingContext}`,
      },
      { role: "assistant", content: "-" },
    ];

    return {
      messages,
      params: { model, max_tokens: 500, temperature: 0.9, min_p: 0.05, frequency_penalty: 0.15 },
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
 */
export const createATTGFactory = (
  getState: () => RootState,
): MessageFactory => {
  return async () => {
    const state = getState();
    const model = "glm-4-6";
    const systemPrompt = String(
      (await api.v1.config.get("system_prompt")) || "",
    );
    const prompt = String(
      (await api.v1.config.get("attg_generate_prompt")) || "",
    );
    const brainstormContent = getConsolidatedBrainstorm(state);
    const canon = getFieldContent(state, FieldID.Canon);

    const messages: Message[] = [
      {
        role: "system",
        content: `${systemPrompt}\n\n[ATTG GENERATION MODE]\n${prompt}`,
      },
      {
        role: "user",
        content: `CANON:\n${canon}\n\nBRAINSTORM:\n${brainstormContent}`,
      },
      { role: "assistant", content: "[" },
    ];

    return {
      messages,
      params: { model, max_tokens: 128, temperature: 0.7, min_p: 0.05 },
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
 */
export const createStyleFactory = (
  getState: () => RootState,
): MessageFactory => {
  return async () => {
    const state = getState();
    const model = "glm-4-6";
    const systemPrompt = String(
      (await api.v1.config.get("system_prompt")) || "",
    );
    const prompt = String(
      (await api.v1.config.get("style_generate_prompt")) || "",
    );
    const brainstormContent = getConsolidatedBrainstorm(state);
    const canon = getFieldContent(state, FieldID.Canon);
    const attg = getFieldContent(state, FieldID.ATTG);

    const messages: Message[] = [
      {
        role: "system",
        content: `${systemPrompt}\n\n[STYLE GENERATION MODE]\n${prompt}`,
      },
      {
        role: "user",
        content: `CANON:\n${canon}\n\nATTG:\n${attg}\n\nBRAINSTORM:\n${brainstormContent}`,
      },
      { role: "assistant", content: "[" },
    ];

    return {
      messages,
      params: { model, max_tokens: 128, temperature: 0.8, min_p: 0.05 },
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
 * Generates a self-contained scene opening instruction for the NAI story LLM.
 */
export const createBootstrapFactory = (
  getState: () => RootState,
): MessageFactory => {
  return async () => {
    const state = getState();
    const model = "glm-4-6";
    const systemPrompt = String(
      (await api.v1.config.get("system_prompt")) || "",
    );

    const canon = getFieldContent(state, FieldID.Canon);
    const dulfsContext = await getAllDulfsContext(state);
    const brainstormContent = getConsolidatedBrainstorm(state);

    // Build context section with available world details
    let worldDetailsSection = "";
    if (dulfsContext) {
      worldDetailsSection = `\n\n[AVAILABLE WORLD DETAILS - may be incomplete]\n${dulfsContext}`;
    }
    if (brainstormContent) {
      worldDetailsSection += `\n\n[BRAINSTORM NOTES]\n${brainstormContent}`;
    }

    const systemMessage = `${systemPrompt}

You are a creative writing assistant specializing in story openings.

${STORY_OPENING_TECHNIQUES}

[TASK]
Analyze the provided canon and any available world details.
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

    const userMessage = `[CANON - Story Foundation]
${canon}${worldDetailsSection}

Generate a self-contained opening scene instruction.`;

    const messages: Message[] = [
      { role: "system", content: systemMessage },
      { role: "user", content: userMessage },
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
