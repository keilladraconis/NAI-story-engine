import {
  RootState,
  BrainstormMessage,
  GenerationStrategy,
} from "../store/types";
import { MessageFactory } from "../../../lib/gen-x";
import { FieldID, FIELD_CONFIGS } from "../../config/field-definitions";

// --- Helpers ---

const getFieldContent = (state: RootState, id: string): string => {
  return state.story.fields[id]?.content || "";
};

const getBrainstormHistory = (state: RootState): BrainstormMessage[] => {
  return state.brainstorm.messages || [];
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

const getCommonContextBlocks = async (
  state: RootState,
  storyContext: Message[],
): Promise<Message[]> => {
  const storyPrompt = getFieldContent(state, FieldID.StoryPrompt);
  const setting = String((await api.v1.storyStorage.get("kse-setting")) || "");
  const worldSnapshot = getFieldContent(state, FieldID.WorldSnapshot);

  return [
    ...storyContext,
    { role: "user", content: `STORY PROMPT:\n${storyPrompt}` },
    { role: "user", content: `SETTING:\n${setting}` },
    { role: "user", content: `WORLD SNAPSHOT:\n${worldSnapshot}` },
  ];
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

    const storyPrompt = getFieldContent(state, FieldID.StoryPrompt);
    const setting = String(
      (await api.v1.storyStorage.get("kse-setting")) || "",
    );
    const worldSnapshot = getFieldContent(state, FieldID.WorldSnapshot);

    let contextBlock = "Here is the current state of the story:\n";
    let hasContext = false;

    if (storyPrompt) {
      contextBlock += `STORY PROMPT:\n${storyPrompt}\n\n`;
      hasContext = true;
    }
    if (setting) {
      contextBlock += `SETTING:\n${setting}\n\n`;
      hasContext = true;
    }
    if (worldSnapshot) {
      contextBlock += `WORLD SNAPSHOT:\n${worldSnapshot}\n\n`;
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
      params: { model, max_tokens: 300, temperature: 0.8, min_p: 0.05 },
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
 * Creates a message factory for story prompt generation.
 */
export const createStoryPromptFactory = (
  getState: () => RootState,
): MessageFactory => {
  return async () => {
    const state = getState();
    const model = "glm-4-6";
    const systemPrompt = String(
      (await api.v1.config.get("system_prompt")) || "",
    );
    const prompt = String(
      (await api.v1.config.get("story_prompt_generate_prompt")) || "",
    );
    const brainstormContent = getConsolidatedBrainstorm(state);
    const storyContext = await getStoryContextMessages();
    const commonBlocks = await getCommonContextBlocks(state, storyContext);

    const messages = contextBuilder(
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt },
      {
        role: "assistant",
        content: "Here is the story prompt based on our brainstorming session:",
      },
      [
        ...commonBlocks,
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
 * Builds a story prompt generation strategy using JIT factory pattern.
 */
export const buildStoryPromptStrategy = (
  getState: () => RootState,
  fieldId: FieldID,
): GenerationStrategy => {
  return {
    requestId: api.v1.uuid(),
    messageFactory: createStoryPromptFactory(getState),
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

    // Use listGenerationInstruction if available, otherwise generationInstruction
    const instruction =
      fieldConfig?.listGenerationInstruction ||
      fieldConfig?.generationInstruction ||
      "";
    const listExampleFormat = fieldConfig?.listExampleFormat || "";
    const brainstormContent = getConsolidatedBrainstorm(state);
    const storyPrompt = getFieldContent(state, FieldID.StoryPrompt);

    const messages: Message[] = [
      {
        role: "system",
        content: `${systemPrompt}\n\n[LIST GENERATION MODE]\n${instruction}\n\nOutput ONLY a bulleted list of names, nothing else.\n\nExample:\n${listExampleFormat}`,
      },
      {
        role: "user",
        content: `STORY PROMPT:\n${storyPrompt}\n\nBRAINSTORM:\n${brainstormContent}`,
      },
      { role: "assistant", content: "-" },
    ];

    return {
      messages,
      params: { model, max_tokens: 72, temperature: 0.9, min_p: 0.05 },
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
    const storyPrompt = getFieldContent(state, FieldID.StoryPrompt);
    const worldSnapshot = getFieldContent(state, FieldID.WorldSnapshot);

    const messages: Message[] = [
      {
        role: "system",
        content: `${systemPrompt}\n\n[ATTG GENERATION MODE]\n${prompt}`,
      },
      {
        role: "user",
        content: `STORY PROMPT:\n${storyPrompt}\n\nWORLD SNAPSHOT:\n${worldSnapshot}\n\nBRAINSTORM:\n${brainstormContent}`,
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
    const storyPrompt = getFieldContent(state, FieldID.StoryPrompt);
    const worldSnapshot = getFieldContent(state, FieldID.WorldSnapshot);
    const attg = getFieldContent(state, FieldID.ATTG);

    const messages: Message[] = [
      {
        role: "system",
        content: `${systemPrompt}\n\n[STYLE GENERATION MODE]\n${prompt}`,
      },
      {
        role: "user",
        content: `STORY PROMPT:\n${storyPrompt}\n\nWORLD SNAPSHOT:\n${worldSnapshot}\n\nATTG:\n${attg}\n\nBRAINSTORM:\n${brainstormContent}`,
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
