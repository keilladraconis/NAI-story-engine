import { StoryState, BrainstormMessage, GenerationRequest, DulfsItem } from "../types";
import { FieldID, DulfsFieldID, FIELD_CONFIGS, LIST_FIELD_IDS } from "../../../config/field-definitions";

export type TextFilter = (text: string) => string;

export interface StrategyResult {
  messages: Message[];
  params: GenerationParams;
  prefixBehavior?: "trim" | "keep";
  assistantPrefill?: string;
  filters?: TextFilter[];
}

export const Filters = {
  scrubBrackets: (t: string) => t.replace(/[\[\]]/g, ""),
  scrubMarkdown: (t: string) => {
    if (!t) return "";
    return t
      .replace(/\*\*(.*?)\*\*/g, "$1") // Bold **
      .replace(/\*(.*?)\*/g, "$1") // Italic *
      .replace(/__(.*?)__/g, "$1") // Bold __
      .replace(/_(.*?)_/g, "$1") // Italic _
      .replace(/\[(.*?)\]\(.*\)/g, "$1") // Links
      .replace(/^#+\s+/gm, "") // Headers
      .replace(/`{1,3}(.*?)`{1,3}/g, "$1"); // Code
  },
  normalizeQuotes: (t: string) =>
    t.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"'),
};

// --- Helpers ---

const getFieldContent = (state: StoryState, id: string): string => {
  return state.fields[id]?.content || "";
};

const getDulfsList = (state: StoryState, id: DulfsFieldID): DulfsItem[] => {
  return state.dulfs[id] || [];
};

const getBrainstormHistory = (state: StoryState): BrainstormMessage[] => {
  const field = state.fields[FieldID.Brainstorm];
  return (field?.data?.messages || []) as BrainstormMessage[];
};

const getConsolidatedBrainstorm = (state: StoryState): string => {
  const history = getBrainstormHistory(state);
  if (history.length > 0) {
    return history.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join("\n");
  }
  return getFieldContent(state, FieldID.Brainstorm);
};

const buildDulfsContextString = (
  state: StoryState,
  excludeFieldId?: string,
): string => {
  let context = "";
  for (const fid of LIST_FIELD_IDS) {
    const summary = state.dulfsSummaries[fid];
    const config = FIELD_CONFIGS.find((c) => c.id === fid);
    const label = config ? config.label.toUpperCase() : fid.toUpperCase();

    if (summary && summary.trim().length > 0) {
      context += `${label} OVERVIEW:\n${summary}\n\n`;
    } else {
      if (fid === excludeFieldId) continue;
      const list = getDulfsList(state, fid as DulfsFieldID);
      if (list.length === 0) continue;
      context += `${label}: ${list.map((i) => i.name).join(", ")}\n\n`;
    }
  }
  return context.trim();
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

const getCommonContextBlocks = (state: StoryState, storyContext: Message[]): Message[] => {
  const storyPrompt = getFieldContent(state, FieldID.StoryPrompt);
  const setting = state.setting;
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
  state: StoryState,
  _request: GenerationRequest
): Promise<StrategyResult> => {
  const model = "glm-4-6";
  const systemPrompt = String((await api.v1.config.get("system_prompt")) || "");
  const brainstormInstruction = String((await api.v1.config.get("brainstorm_prompt")) || "");
  
  const systemMsg: Message = {
    role: "system",
    content: `${systemPrompt}\n\n[BRAINSTORMING MODE]\n${brainstormInstruction}`,
  };

  const messages: Message[] = [systemMsg];
  const storyContext = await getStoryContextMessages();
  messages.push(...storyContext);

  const storyPrompt = getFieldContent(state, FieldID.StoryPrompt);
  const setting = state.setting;
  const worldSnapshot = getFieldContent(state, FieldID.WorldSnapshot);

  let contextBlock = "Here is the current state of the story:\n";
  let hasContext = false;

  if (storyPrompt) { contextBlock += `STORY PROMPT:\n${storyPrompt}\n\n`; hasContext = true; }
  if (setting) { contextBlock += `SETTING:\n${setting}\n\n`; hasContext = true; }
  if (worldSnapshot) { contextBlock += `WORLD SNAPSHOT:\n${worldSnapshot}\n\n`; hasContext = true; }

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
  const cleanHistory = history.filter(m => !(m.role === 'assistant' && !m.content.trim()));
  const historyMessages: Message[] = cleanHistory.map(m => ({
    role: m.role as "user" | "assistant",
    content: m.content
  }));

  messages.push(...historyMessages);

  return {
    messages,
    params: { model, max_tokens: 300, temperature: 0.8, min_p: 0.05 },
    prefixBehavior: "keep"
  };
};

export const buildStoryPromptStrategy = async (
  state: StoryState
): Promise<StrategyResult> => {
  const model = "glm-4-6";
  const systemPrompt = String((await api.v1.config.get("system_prompt")) || "");
  const prompt = String((await api.v1.config.get("story_prompt_generate_prompt")) || "");
  const brainstormContent = getConsolidatedBrainstorm(state);
  const storyContext = await getStoryContextMessages();
  const commonBlocks = getCommonContextBlocks(state, storyContext);

  const messages = contextBuilder(
    { role: "system", content: systemPrompt },
    { role: "user", content: prompt },
    { role: "assistant", content: "Here is the story prompt based on our brainstorming session:" },
    [
      ...commonBlocks,
      { role: "user", content: `BRAINSTORM MATERIAL:\n${brainstormContent}` },
    ]
  );

  return {
    messages,
    params: { model, temperature: 1.1, min_p: 0.05, presence_penalty: 0.1, max_tokens: 1024 },
    prefixBehavior: "trim",
  };
};

export const buildWorldSnapshotStrategy = async (
  state: StoryState
): Promise<StrategyResult> => {
  const model = "glm-4-6";
  const systemPrompt = String((await api.v1.config.get("system_prompt")) || "");
  const prompt = String((await api.v1.config.get("world_snapshot_prompt")) || "");
  const brainstormContent = getConsolidatedBrainstorm(state);
  const storyContext = await getStoryContextMessages();
  const commonBlocks = getCommonContextBlocks(state, storyContext);

  const messages = contextBuilder(
    { role: "system", content: systemPrompt },
    { role: "user", content: prompt },
    { role: "assistant", content: "Here is the dynamic world snapshot, focusing on drivers and tensions:" },
    [
      ...commonBlocks,
      { role: "user", content: `BRAINSTORM MATERIAL:\n${brainstormContent}` },
    ]
  );

  return {
    messages,
    params: { model, temperature: 1.1, min_p: 0.05, presence_penalty: 0.1, max_tokens: 1024 },
    prefixBehavior: "trim",
  };
};

export const buildDulfsListStrategy = async (
  state: StoryState,
  request: GenerationRequest
): Promise<StrategyResult> => {
  const model = "glm-4-6";
  const systemPrompt = String((await api.v1.config.get("system_prompt")) || "");
  const fieldId = request.targetId;
  const config = FIELD_CONFIGS.find((c) => c.id === fieldId);
  const label = config ? config.label : fieldId;
  
  const currentList = getDulfsList(state, fieldId as DulfsFieldID);
  const existingNames = currentList.map((i) => i.name).join(", ");
  
  const attg = getFieldContent(state, FieldID.ATTG);
  const style = getFieldContent(state, FieldID.Style);
  const brainstormContent = getConsolidatedBrainstorm(state);
  const storyContext = await getStoryContextMessages();
  const commonBlocks = getCommonContextBlocks(state, storyContext);

  const messages = contextBuilder(
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: `Generate a list of 5-10 new, unique names/subjects for the category '${label}'.
${config?.listGenerationInstruction || ""}
Output ONLY the names, separated by newlines, no other text.`,
    },
    { role: "assistant", content: "" },
    [
      ...commonBlocks,
      { role: "user", content: `ATTG:\n${attg}` },
      { role: "user", content: `STYLE:\n${style}` },
      { role: "user", content: `BRAINSTORM MATERIAL:\n${brainstormContent}` },
      existingNames
        ? { role: "user", content: `EXISTING ${label.toUpperCase()} (Do not repeat):\n${existingNames}` }
        : { role: "user", content: "" },
    ]
  );

  return {
    messages,
    params: { model, temperature: 1.2, min_p: 0.1, presence_penalty: 0.1, max_tokens: 512 },
    prefixBehavior: "trim",
  };
};

export const buildDulfsContentStrategy = async (
  state: StoryState,
  request: GenerationRequest
): Promise<StrategyResult> => {
  const model = "glm-4-6";
  const systemPrompt = String((await api.v1.config.get("system_prompt")) || "");
  
  // Target format: "FieldID:ItemID"
  const [fieldId, itemId] = request.targetId.split(":");
  const list = getDulfsList(state, fieldId as DulfsFieldID);
  const item = list.find((i) => i.id === itemId);

  if (!item) throw new Error(`Item ${itemId} not found in ${fieldId}`);

  const config = FIELD_CONFIGS.find((c) => c.id === fieldId);
  const label = config ? config.label : fieldId;
  const prefill = fieldId === FieldID.DramatisPersonae ? `${item.name} (` : `${item.name}: `;

  const dulfsContext = buildDulfsContextString(state, fieldId);
  const brainstormContent = getConsolidatedBrainstorm(state);
  const storyContext = await getStoryContextMessages();
  const commonBlocks = getCommonContextBlocks(state, storyContext);

  const messages = contextBuilder(
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: `Complete the details for the ${label} entry named "${item.name}".
${config?.generationInstruction || ""}
${config?.exampleFormat ? `Format: ${config.exampleFormat}` : ""}
Keep the description concise and focused on narrative potential.`,
    },
    { role: "assistant", content: prefill },
    [
      ...commonBlocks,
      { role: "user", content: `BRAINSTORM MATERIAL:\n${brainstormContent}` },
      dulfsContext
        ? { role: "user", content: `OTHER ESTABLISHED WORLD ELEMENTS:\n${dulfsContext}` }
        : { role: "user", content: "" },
    ]
  );

  const filters = config?.filters
    ? config.filters.map((f) => Filters[f as keyof typeof Filters]).filter((f) => !!f)
    : [];

  return {
    messages,
    params: { model, temperature: 0.85, min_p: 0.05, presence_penalty: 0.05, max_tokens: 1024 },
    prefixBehavior: "keep",
    assistantPrefill: prefill,
    filters,
  };
};

export const buildStrategy = async (
  state: StoryState,
  request: GenerationRequest
): Promise<StrategyResult> => {
  if (request.type === "brainstorm") {
    return buildBrainstormStrategy(state, request);
  }
  
  if (request.targetId === FieldID.StoryPrompt) {
    return buildStoryPromptStrategy(state);
  }
  
  if (request.targetId === FieldID.WorldSnapshot) {
    return buildWorldSnapshotStrategy(state);
  }
  
  if (request.type === "list") {
    return buildDulfsListStrategy(state, request);
  }
  
  if (request.type === "field" && request.targetId.includes(":")) {
    return buildDulfsContentStrategy(state, request);
  }
  
  throw new Error(`Unknown generation target or type: ${request.type} / ${request.targetId}`);
}
