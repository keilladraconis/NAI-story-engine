import {
  RootState,
  BrainstormMessage,
  GenerationStrategy,
} from "../store/types";
import { FieldID, FIELD_CONFIGS } from "../../config/field-definitions";

export interface StrategyResult {
  messages: Message[];
  params: GenerationParams;
  prefixBehavior?: "trim" | "keep";
  assistantPrefill?: string;
  filters?: any[];
}

// --- Helpers ---

const getFieldContent = (state: RootState, id: string): string => {
  return state.story.fields[id]?.content || "";
};

const getBrainstormHistory = (state: RootState): BrainstormMessage[] => {
  return state.brainstorm.messages || [];
};

const getConsolidatedBrainstorm = (state: RootState): string => {
  const history = getBrainstormHistory(state);
  // Fallback to legacy field content if history is empty?
  // No, new architecture uses slice.
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

// --- Strategies ---

export const buildBrainstormStrategy = async (
  state: RootState,
  assistantId?: string,
): Promise<GenerationStrategy> => {
  const model = "glm-4-6";
  const systemPrompt = String((await api.v1.config.get("system_prompt")) || "");
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
  const setting = String((await api.v1.storyStorage.get("kse-setting")) || "");
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
      content: "Understood. I have the full story context in mind. Let's jam.",
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
  const messageId = assistantId ? assistantId : history.at(-1)!.id;

  messages.push(...historyMessages);

  return {
    requestId: api.v1.uuid(),
    messages,
    params: { model, max_tokens: 300, temperature: 0.8, min_p: 0.05 },
    prefixBehavior: "keep",
    target: {
      type: "brainstorm",
      messageId,
    },
  };
};

export const buildStoryPromptStrategy = async (
  state: RootState,
  fieldId: FieldID,
): Promise<GenerationStrategy> => {
  const model = "glm-4-6";
  const systemPrompt = String((await api.v1.config.get("system_prompt")) || "");
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
    requestId: api.v1.uuid(),
    messages,
    params: {
      model,
      temperature: 1.1,
      min_p: 0.05,
      presence_penalty: 0.1,
      max_tokens: 1024,
    },
    target: { type: "field", fieldId },
    prefixBehavior: "trim",
  };
};

export const buildDulfsListStrategy = async (
  state: RootState,
  fieldId: string,
): Promise<GenerationStrategy> => {
  const model = "glm-4-6";
  const systemPrompt = String((await api.v1.config.get("system_prompt")) || "");
  const fieldConfig = FIELD_CONFIGS.find((f) => f.id === fieldId);

  // Use listGenerationInstruction if available, otherwise generationInstruction
  const instruction =
    fieldConfig?.listGenerationInstruction ||
    fieldConfig?.generationInstruction ||
    "";
  const exampleFormat = fieldConfig?.exampleFormat || "";
  const brainstormContent = getConsolidatedBrainstorm(state);
  const storyPrompt = getFieldContent(state, FieldID.StoryPrompt);

  const messages: Message[] = [
    {
      role: "system",
      content: `${systemPrompt}\n\n[LIST GENERATION MODE]\n${instruction}\n\nExample format:\n${exampleFormat}`,
    },
    {
      role: "user",
      content: `STORY PROMPT:\n${storyPrompt}\n\nBRAINSTORM:\n${brainstormContent}`,
    },
    { role: "assistant", content: "Here are the items:" },
  ];

  return {
    requestId: api.v1.uuid(),
    messages,
    params: { model, max_tokens: 512, temperature: 0.9, min_p: 0.05 },
    target: { type: "list", fieldId },
    prefixBehavior: "trim",
  };
};
