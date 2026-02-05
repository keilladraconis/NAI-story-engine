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

const getStoryContextMessages = async (): Promise<Message[]> => {
  try {
    const messages = await api.v1.buildContext({ contextLimitReduction: 4000 });
    return messages.filter((m) => m.role !== "system");
  } catch (e) {
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
      content: `${systemPrompt}\n\n[BRAINSTORMING MODE]\n${brainstormInstruction}`,
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
    prefixBehavior: "keep",
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
    prefixBehavior: "trim",
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
    prefixBehavior: "trim",
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
    prefixBehavior: "keep",
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
    prefixBehavior: "keep",
    assistantPrefill: "[",
  };
};
