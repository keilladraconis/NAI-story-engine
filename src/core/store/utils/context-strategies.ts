import { StoryState, StoryField, DulfsItem, GenerationRequest } from "../types";
import { FieldID, FIELD_CONFIGS, LIST_FIELD_IDS, DulfsFieldID } from "../../../config/field-definitions";

export interface StrategyResult {
  messages: Message[];
  params: GenerationParams;
  filters?: TextFilter[];
  prefixBehavior?: "trim" | "keep";
  assistantPrefill?: string;
}

export type TextFilter = (text: string) => string;

export const Filters = {
  scrubBrackets: (t: string) => t.replace(/[[\\\]]/g, ""),
  scrubMarkdown: (t: string) => {
    if (!t) return "";
    return t
      .replace(/\*\*(.*?)\*\*/g, "$1") // Bold **
      .replace(/\*(.*?)\*/g, "$1") // Italic *
      .replace(/__(.*?)__/g, "$1") // Bold __
      .replace(/_(.*?)_/g, "$1") // Italic _
      .replace(/[(.*?)]\(.*\)/g, "$1") // Links
      .replace(/^#+\\s+/gm, "") // Headers
      .replace(/`{1,3}(.*?)`{1,3}/g, "$1"); // Code
  },
  normalizeQuotes: (t: string) =>
    t.replace(/[\u2018\u2019]/g, "'" ).replace(/[\u201C\u201D]/g, '"'),
};

const getFieldContent = (state: StoryState, id: string): string => {
  return state.fields[id]?.content || "";
};

const getDulfsList = (state: StoryState, id: DulfsFieldID): DulfsItem[] => {
  return state.dulfs[id] || [];
};

const getConsolidatedBrainstorm = (state: StoryState): string => {
    const field = state.fields[FieldID.Brainstorm];
    if (field && field.data && Array.isArray(field.data.messages)) {
        return field.data.messages.map((m: any) => `${m.role}: ${m.content}`).join("\n");
    }
    return field?.content || "";
};

const buildDulfsContextString = (state: StoryState, excludeFieldId?: string): string => {
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
        return messages.filter(m => m.role !== 'system');
    } catch (e) {
        return [];
    }
};

export const buildStrategy = async (
    state: StoryState, 
    request: GenerationRequest
): Promise<StrategyResult> => {
    const model = (await api.v1.config.get("model")) || "kayra-v1"; // Fallback if needed
    const systemPrompt = String((await api.v1.config.get("system_prompt")) || "");
    const storyPrompt = getFieldContent(state, FieldID.StoryPrompt);
    const setting = state.setting;
    const worldSnapshot = getFieldContent(state, FieldID.WorldSnapshot);
    const attg = getFieldContent(state, FieldID.ATTG);
    const style = getFieldContent(state, FieldID.Style);
    const brainstormContent = getConsolidatedBrainstorm(state);

    const storyContext = await getStoryContextMessages();
    const commonContextBlocks: Message[] = [
        ...storyContext,
        { role: "user", content: `STORY PROMPT:\n${storyPrompt}` },
        { role: "user", content: `SETTING:\n${setting}` },
        { role: "user", content: `WORLD SNAPSHOT:\n${worldSnapshot}` },
    ];

    // --- Strategy: Story Prompt ---
    if (request.targetId === FieldID.StoryPrompt) {
        const prompt = String((await api.v1.config.get("story_prompt_generate_prompt")) || "");
        return {
            messages: contextBuilder(
                { role: "system", content: systemPrompt },
                { role: "user", content: prompt },
                { role: "assistant", content: "Here is the story prompt based on our brainstorming session:" },
                [
                    ...commonContextBlocks,
                    { role: "user", content: `BRAINSTORM MATERIAL:\n${brainstormContent}` }
                ]
            ),
            params: { model, temperature: 1.1, min_p: 0.05, presence_penalty: 0.1, max_tokens: 1024 },
            prefixBehavior: "trim"
        };
    }

    // --- Strategy: World Snapshot ---
    if (request.targetId === FieldID.WorldSnapshot) {
        const prompt = String((await api.v1.config.get("world_snapshot_prompt")) || "");
        return {
             messages: contextBuilder(
                { role: "system", content: systemPrompt },
                { role: "user", content: prompt },
                { role: "assistant", content: "Here is the dynamic world snapshot, focusing on drivers and tensions:" },
                [
                    ...commonContextBlocks,
                    { role: "user", content: `BRAINSTORM MATERIAL:\n${brainstormContent}` }
                ]
            ),
            params: { model, temperature: 1.1, min_p: 0.05, presence_penalty: 0.1, max_tokens: 1024 },
            prefixBehavior: "trim"
        };
    }
    
    // --- Strategy: Dulfs List ---
    if (request.type === 'list') {
        const fieldId = request.targetId;
        const config = FIELD_CONFIGS.find(c => c.id === fieldId);
        const label = config ? config.label : fieldId;
        const currentList = getDulfsList(state, fieldId as DulfsFieldID);
        const existingNames = currentList.map(i => i.name).join(", ");
        
        const messages = contextBuilder(
            { role: "system", content: systemPrompt },
            {
                role: "user", 
                content: `Generate a list of 5-10 new, unique names/subjects for the category '${label}'.
${config?.listGenerationInstruction || ""}
Output ONLY the names, separated by newlines, no other text.` 
            },
            { role: "assistant", content: "" },
            [
                ...commonContextBlocks,
                { role: "user", content: `ATTG:\n${attg}` },
                { role: "user", content: `STYLE:\n${style}` },
                { role: "user", content: `BRAINSTORM MATERIAL:\n${brainstormContent}` },
                existingNames ? { role: "user", content: `EXISTING ${label.toUpperCase()} (Do not repeat):\n${existingNames}` } : { role: 'user', content: '' }
            ]
        );
        
        return {
            messages,
            params: { model, temperature: 1.2, min_p: 0.1, presence_penalty: 0.1, max_tokens: 512 },
            prefixBehavior: "trim"
        };
    }

    // --- Strategy: Brainstorm ---
    if (request.type === 'brainstorm') {
        const isInitial = !brainstormContent; // Rough check
        
        const brainstormPrompt = String((await api.v1.config.get("brainstorm_prompt")) || "");
        
        const systemMsg = `${systemPrompt}\n\n[BRAINSTORMING MODE]\n${brainstormPrompt}`;
        const messages: Message[] = [{ role: "system", content: systemMsg }];
        
        messages.push(...storyContext);
        
        let contextBlock = "Here is the current state of the story:\n";
        let hasContext = false;
        
        if (storyPrompt) { contextBlock += `STORY PROMPT:\n${storyPrompt}\n\n`; hasContext = true; }
        if (setting) { contextBlock += `SETTING:\n${setting}\n\n`; hasContext = true; }
        if (worldSnapshot) { contextBlock += `WORLD SNAPSHOT:\n${worldSnapshot}\n\n`; hasContext = true; }

        if (hasContext) {
            messages.push({ role: "user", content: `${contextBlock}Let's brainstorm based on this context.` });
            messages.push({ role: "assistant", content: "Understood. I will be a creative partner to the user, offering casual reactions and jamming on ideas without over-explaining. I'll keep my responses short, punchy, and focused on one thing at a time. I have the full story context in mind.\n[Continue:]\n" });
        }

        const field = state.fields[FieldID.Brainstorm];
        const history = (field?.data?.messages || []) as Message[];
        const recentHistory = history.slice(-20);
        
        recentHistory.forEach(msg => messages.push({ role: msg.role, content: msg.content }));
        
        if (isInitial) {
             messages.push({ role: "user", content: "Continue brainstorming on your own. Surprise me with some new ideas or deep-dives into the existing ones." });
        }
        
        return {
            messages,
            params: { model, max_tokens: 300, temperature: 1 },
            prefixBehavior: "keep"
        };
    }

    // --- Strategy: Dulfs Content ---
    if (request.type === 'field' && request.targetId.includes(':')) {
        const [fieldId, itemId] = request.targetId.split(':');
        const list = getDulfsList(state, fieldId as DulfsFieldID);
        const item = list.find(i => i.id === itemId);
        
        if (!item) throw new Error(`Item ${itemId} not found in ${fieldId}`);
        
        const config = FIELD_CONFIGS.find(c => c.id === fieldId);
        const label = config ? config.label : fieldId;
        const prefill = fieldId === FieldID.DramatisPersonae ? `${item.name} (` : `${item.name}: `; 
        
        const dulfsContext = buildDulfsContextString(state, fieldId);
        
        const messages = contextBuilder(
            { role: "system", content: systemPrompt },
            {
                role: "user", 
                content: `Complete the details for the ${label} entry named "${item.name}".
${config?.generationInstruction || ""}
${config?.exampleFormat ? `Format: ${config.exampleFormat}` : ""}
Keep the description concise and focused on narrative potential.` 
            },
            { role: "assistant", content: prefill },
            [
                ...commonContextBlocks,
                { role: "user", content: `BRAINSTORM MATERIAL:\n${brainstormContent}` },
                dulfsContext ? { role: "user", content: `OTHER ESTABLISHED WORLD ELEMENTS:\n${dulfsContext}` } : { role: 'user', content: '' }
            ]
        );
        
        return {
            messages,
            params: { model, temperature: 0.85, min_p: 0.05, presence_penalty: 0.05, max_tokens: 1024 },
            prefixBehavior: "keep",
            assistantPrefill: prefill,
            filters: config?.filters ? config.filters.map(f => Filters[f]).filter(f => !!f) : []
        };
    }

    // Default / Fallback
    return {
        messages: [{ role: "user", content: "Error: Unknown generation target" }],
        params: { model, max_tokens: 10 }
    };
};