import { HyperGenerationParams } from "../../lib/hyper-generator";
import { StoryManager } from "./story-manager";
import { FieldSession } from "./agent-workflow";
import {
  FieldID,
  FIELD_CONFIGS,
  LIST_FIELD_IDS,
} from "../config/field-definitions";

// Local implementation of context builder that avoids the "double newline" behavior
// of the library version, which causes double-spaced generation.
export const contextBuilder = (
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

export type TextFilter = (text: string) => string;

export const Filters = {
  scrubBrackets: (t: string) => t.replace(/[\[\]]/g, ""),
  scrubMarkdown: (t: string) => {
    if (!t) return "";
    return t
      .replace(/\*\*(.*?)\*\*/g, "$1") // Bold **
      .replace(/\*(.*?)\*/g, "$1") // Italic *
      .replace(/__(.*?)__/g, "$1") // Bold __
      .replace(/_(.*?)_/g, "$1") // Italic _
      .replace(/\[(.*?)\]\(.*?\)/g, "$1") // Links
      .replace(/^#+\s+/gm, "") // Headers
      .replace(/`{1,3}(.*?)`{1,3}/g, "$1"); // Code
  },
  normalizeQuotes: (t: string) =>
    t.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"'),
};

export interface StrategyResult {
  messages: Message[];
  params: Partial<HyperGenerationParams>;
  filters?: TextFilter[];
  prefixBehavior?: "trim" | "keep";
}

type StrategyFn = (
  session: FieldSession,
  manager: StoryManager,
  base: {
    systemMsg: Message;
    storyPrompt: string;
    setting: string;
    storyContext: Message[];
  },
) => Promise<StrategyResult>;

export const buildDulfsContextString = (
  manager: StoryManager,
  excludeFieldId?: string,
): string => {
  let context = "";
  for (const fid of LIST_FIELD_IDS) {
    const summary = manager.getDulfsSummary(fid);
    const config = FIELD_CONFIGS.find((c) => c.id === fid);
    const label = config ? config.label.toUpperCase() : fid.toUpperCase();

    if (summary && summary.trim().length > 0) {
      // Always include summary if available, as it is high-value context
      context += `${label} OVERVIEW:\n${summary}\n\n`;
    } else {
      // Fallback: List names if no summary
      // Respect excludeFieldId for raw lists to avoid redundancy/recursion issues
      if (fid === excludeFieldId) continue;

      const list = manager.getDulfsList(fid);
      if (list.length === 0) continue;

      context += `${label}: ${list.map((i) => i.name).join(", ")}\n\n`;
    }
  }
  return context.trim();
};

export const normalizeQuotes = (str: string): string => {
  return str.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');
};

const Strategies: Record<string, StrategyFn> = {
  // Generate (Default / Brainstorm) - The Ideator
  // High creativity, divergent thinking
  "generate:default": async (_session, _manager, base) => {
    const userPrompt = (await api.v1.config.get("brainstorm_prompt")) || "";
    const messages = contextBuilder(
      base.systemMsg,
      { role: "user", content: userPrompt },
      {
        role: "assistant",
        content:
          "I will explore the narrative vectors and three-sphere frictions:",
      },
      [
        ...base.storyContext,
        {
          role: "user",
          content: `STORY PROMPT:\n${base.storyPrompt}`,
        },
        {
          role: "user",
          content: `SETTING:\n${base.setting}`,
        },
      ],
    );
    return {
      messages,
      params: {
        temperature: 1.35,
        min_p: 0.1,
        presence_penalty: 0.05,
        maxTokens: 2048,
      },
      prefixBehavior: "trim",
    };
  },

  // Generate (Story Prompt) - The Initiator
  // Takes brainstorm chat and turns it into a high-level premise
  "generate:storyPrompt": async (_session, manager, base) => {
    const userPrompt =
      (await api.v1.config.get("story_prompt_generate_prompt")) || "";
    const brainstormContent = manager.getConsolidatedBrainstorm();
    const messages = contextBuilder(
      base.systemMsg,
      { role: "user", content: userPrompt },
      {
        role: "assistant",
        content: "Here is the story prompt based on our brainstorming session:",
      },
      [
        ...base.storyContext,
        {
          role: "user",
          content: `SETTING:\n${base.setting}`,
        },
        {
          role: "user",
          content: `BRAINSTORM MATERIAL:\n${brainstormContent}`,
        },
      ],
    );
    return {
      messages,
      params: {
        temperature: 1.1,
        min_p: 0.05,
        presence_penalty: 0.1,
        maxTokens: 1024,
      },
      prefixBehavior: "trim",
    };
  },

  // Generate (Dynamic World Snapshot) - The Architect
  // Balanced structure and creativity
  "generate:worldSnapshot": async (_session, manager, base) => {
    const userPrompt = (await api.v1.config.get("world_snapshot_prompt")) || "";
    const brainstormContent = manager.getConsolidatedBrainstorm();
    const messages = contextBuilder(
      base.systemMsg,
      { role: "user", content: userPrompt },
      {
        role: "assistant",
        content:
          "Here is the dynamic world snapshot, focusing on drivers and tensions:",
      },
      [
        ...base.storyContext,
        {
          role: "user",
          content: `STORY PROMPT:\n${base.storyPrompt}`,
        },
        {
          role: "user",
          content: `SETTING:\n${base.setting}`,
        },
        {
          role: "user",
          content: `BRAINSTORM MATERIAL:\n${brainstormContent}`,
        },
      ],
    );
    return {
      messages,
      params: {
        temperature: 1.1,
        min_p: 0.05,
        presence_penalty: 0.1,
        maxTokens: 2048,
      },
      prefixBehavior: "trim",
    };
  },

  // Generate (ATTG)
  "generate:attg": async (_session, manager, base) => {
    const userPrompt = (await api.v1.config.get("attg_generate_prompt")) || "";
    const worldSnapshot = manager.getFieldContent(FieldID.WorldSnapshot);
    const brainstormContent = manager.getConsolidatedBrainstorm();
    const messages = contextBuilder(
      base.systemMsg,
      {
        role: "user",
        content: userPrompt,
      },
      {
        role: "assistant",
        content: "[ Author:",
      },
      [
        ...base.storyContext,
        {
          role: "user",
          content: `STORY PROMPT:\n${base.storyPrompt}`,
        },
        {
          role: "user",
          content: `SETTING:\n${base.setting}`,
        },
        {
          role: "user",
          content: `WORLD SNAPSHOT:\n${worldSnapshot}`,
        },
        {
          role: "user",
          content: `BRAINSTORM MATERIAL:\n${brainstormContent}`,
        },
      ],
    );
    return {
      messages,
      params: {
        temperature: 0.8,
        min_p: 0.05,
        presence_penalty: 0.0,
        maxTokens: 128,
        minTokens: 10,
        stopSequences: ["]"],
      },
    };
  },

  // Generate (Style)
  "generate:style": async (_session, manager, base) => {
    const userPrompt = (await api.v1.config.get("style_generate_prompt")) || "";
    const worldSnapshot = manager.getFieldContent(FieldID.WorldSnapshot);
    const brainstormContent = manager.getConsolidatedBrainstorm();
    const messages = contextBuilder(
      base.systemMsg,
      {
        role: "user",
        content: userPrompt,
      },
      {
        role: "assistant",
        content: "[ Write in a style that conveys the following:",
      },
      [
        ...base.storyContext,
        {
          role: "user",
          content: `STORY PROMPT:\n${base.storyPrompt}`,
        },
        {
          role: "user",
          content: `SETTING:\n${base.setting}`,
        },
        {
          role: "user",
          content: `WORLD SNAPSHOT:\n${worldSnapshot}`,
        },
        {
          role: "user",
          content: `BRAINSTORM MATERIAL:\n${brainstormContent}`,
        },
      ],
    );
    return {
      messages,
      params: {
        temperature: 0.8,
        min_p: 0.05,
        presence_penalty: 0.0,
        maxTokens: 128,
        minTokens: 10,
        stopSequences: ["]"],
      },
    };
  },

  // Generate (Lorebook)
  "generate:lorebook": async (session, manager, base) => {
    let itemName = "the entity";
    let itemDesc = "";
    let categoryId = "generic";

    if (session.fieldId.startsWith("lorebook:")) {
      const entryId = session.fieldId.split(":")[1];
      const match = manager.findDulfsByLorebookId(entryId);
      if (match) {
        itemName = match.item.name;
        itemDesc = match.item.content;
        categoryId = match.fieldId;
      }
    } else {
      const [fieldId, itemId] = session.fieldId.split(":");
      categoryId = fieldId;
      const list = manager.getDulfsList(fieldId);
      const item = list.find((i) => i.id === itemId);
      if (item) {
        itemName = item.name;
        itemDesc = item.content;
      }
    }

    const basePrompt =
      (await api.v1.config.get("lorebook_generate_prompt")) || "";

    // Select specific template based on category
    let templateKey;
    switch (categoryId) {
      case "dramatisPersonae":
        templateKey = "lorebook_template_character";
        break;
      case "locations":
        templateKey = "lorebook_template_location";
        break;
      case "factions":
        templateKey = "lorebook_template_faction";
        break;
      case "universeSystems":
        templateKey = "lorebook_template_system";
        break;
      case "situationalDynamics":
        templateKey = "lorebook_template_dynamic";
        break;
      default:
        templateKey = "lorebook_template_character";
    }

    const templateContent = (await api.v1.config.get(templateKey)) || "";
    const worldSnapshot = manager.getFieldContent(FieldID.WorldSnapshot);
    const brainstormContent = manager.getConsolidatedBrainstorm();
    const dulfsContext = buildDulfsContextString(manager, "short");

    const combinedInstruction = `${basePrompt.replace("[itemName]", itemName)}\n\nTASK: Fill in the following Template for "${itemName}". Replace the placeholders with generated content.\n\nTEMPLATE:\n${templateContent}`;

    // Note: base.storyContext is intentionally EXCLUDED from lorebook generation
    const messages = contextBuilder(
      base.systemMsg,
      { role: "user", content: combinedInstruction },
      {
        role: "assistant",
        content: `Name: ${itemName}\nSetting: ${base.setting}\n`,
      },
      [
        {
          role: "user",
          content: `STORY PROMPT:\n${base.storyPrompt}`,
        },
        {
          role: "user",
          content: `SETTING:\n${base.setting}`,
        },
        {
          role: "user",
          content: `WORLD SNAPSHOT:\n${worldSnapshot}`,
        },
        {
          role: "user",
          content: `BRAINSTORM MATERIAL:\n${brainstormContent}`,
        },
        {
          role: "user",
          content: `ESTABLISHED WORLD ELEMENTS:\n${dulfsContext}`,
        },
        {
          role: "user",
          content: `ENTITY DATA:\nName: ${itemName}\nDescription: ${itemDesc}`,
        },
      ],
    );

    return {
      messages,
      params: {
        temperature: 0.8,
        min_p: 0.05,
        presence_penalty: 0.1,
        maxTokens: 1536,
      },
      filters: [Filters.scrubBrackets],
    };
  },
};

export class ContextStrategyFactory {
  constructor(private storyManager: StoryManager) {}

  private async getStoryContextMessages(
    reduction: number = 3000,
  ): Promise<Message[]> {
    try {
      const messages = await api.v1.buildContext({
        contextLimitReduction: reduction,
      });
      // Filter out system messages to avoid duplication with our custom system prompts
      return messages.filter((m) => m.role !== "system");
    } catch (e) {
      api.v1.log("Failed to build story context via api.v1.buildContext", e);
      return [];
    }
  }

  async build(session: FieldSession): Promise<StrategyResult> {
    const systemPrompt = (await api.v1.config.get("system_prompt")) || "";
    const storyPrompt = this.storyManager.getFieldContent(FieldID.StoryPrompt);
    const setting = this.storyManager.getSetting();

    const key = this.getStrategyKey(session);
    let storyContext: Message[] = [];
    if (key !== "generate:lorebook") {
      storyContext = await this.getStoryContextMessages(4000);
    }

    const baseContext = {
      systemMsg: {
        role: "system" as const,
        content: systemPrompt,
      },
      storyPrompt: storyPrompt,
      setting: setting,
      storyContext: storyContext,
    };

    const strategy = Strategies[key] || Strategies["generate:default"];

    const result = await strategy(session, this.storyManager, baseContext);

    // Apply filters from config if present
    const config = FIELD_CONFIGS.find((c) => c.id === session.fieldId);
    if (config?.filters) {
      result.filters = result.filters || [];
      for (const filterKey of config.filters) {
        if (Filters[filterKey]) {
          result.filters.push(Filters[filterKey]);
        }
      }
    }

    return result;
  }

  async buildBrainstormContext(
    isInitialOrEmpty: boolean,
  ): Promise<StrategyResult> {
    const history = this.storyManager.getBrainstormMessages();
    const systemPrompt = (await api.v1.config.get("system_prompt")) || "";
    const brainstormPrompt =
      (await api.v1.config.get("brainstorm_prompt")) || "";
    const storyPrompt = this.storyManager.getFieldContent(FieldID.StoryPrompt);
    const setting = this.storyManager.getSetting();
    const worldSnapshot = this.storyManager.getFieldContent(
      FieldID.WorldSnapshot,
    );
    const attg = this.storyManager.getFieldContent(FieldID.ATTG);
    const style = this.storyManager.getFieldContent(FieldID.Style);
    const dulfsContext = buildDulfsContextString(this.storyManager, "short");

    const systemMsg = `${systemPrompt}\n\n[BRAINSTORMING MODE]\n${brainstormPrompt}`;
    const messages: Message[] = [{ role: "system", content: systemMsg }];

    // Inject Story Context
    const storyContext = await this.getStoryContextMessages(4000);
    messages.push(...storyContext);

    // Build Context Block
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
    if (attg) {
      contextBlock += `ATTG:\n${attg}\n\n`;
      hasContext = true;
    }
    if (style) {
      contextBlock += `STYLE:\n${style}\n\n`;
      hasContext = true;
    }
    if (dulfsContext) {
      contextBlock += `ESTABLISHED WORLD ELEMENTS:\n${dulfsContext}\n\n`;
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
          "Understood. I will be a creative partner to the user, offering casual reactions and jamming on ideas without over-explaining. I'll keep my responses short, punchy, and focused on one thing at a time. I have the full story context in mind.\n[Continue:]\n",
      });
    }

    // Append Chat History
    const recentHistory = history.slice(-20);
    recentHistory.forEach((msg) => {
      messages.push({ role: msg.role as any, content: msg.content });
    });

    // If empty send, add a nudge
    if (isInitialOrEmpty) {
      messages.push({
        role: "user",
        content:
          "Continue brainstorming on your own. Surprise me with some new ideas or deep-dives into the existing ones.",
      });
    }

    return {
      messages,
      params: {
        maxTokens: 300,
        minTokens: 10,
        temperature: 1,
      },
    };
  }

  async buildDulfsListContext(fieldId: string): Promise<StrategyResult> {
    const systemPrompt = (await api.v1.config.get("system_prompt")) || "";
    const storyPrompt = this.storyManager.getFieldContent(FieldID.StoryPrompt);
    const setting = this.storyManager.getSetting();
    const worldSnapshot = this.storyManager.getFieldContent(
      FieldID.WorldSnapshot,
    );
    const attg = this.storyManager.getFieldContent(FieldID.ATTG);
    const style = this.storyManager.getFieldContent(FieldID.Style);

    // Existing items to avoid duplicates
    const currentList = this.storyManager.getDulfsList(fieldId);
    const existingNames = currentList.map((i) => i.name).join(", ");

    const config = FIELD_CONFIGS.find((c) => c.id === fieldId);
    const label = config ? config.label : fieldId;

    const baseContext = {
      systemMsg: {
        role: "system" as const,
        content: systemPrompt,
      },
      storyPrompt: storyPrompt,
    };

    const storyContext = await this.getStoryContextMessages(4000);

    const contextBlocks: Message[] = [
      ...storyContext,
      {
        role: "user",
        content: `STORY PROMPT:\n${storyPrompt}`,
      },
      {
        role: "user",
        content: `SETTING:\n${setting}`,
      },
      {
        role: "user",
        content: `WORLD SNAPSHOT:\n${worldSnapshot}`,
      },
      {
        role: "user",
        content: `ATTG:\n${attg}`,
      },
      {
        role: "user",
        content: `STYLE:\n${style}`,
      },
      {
        role: "user",
        content: `BRAINSTORM MATERIAL:\n${this.storyManager.getConsolidatedBrainstorm()}`,
      },
    ];

    if (existingNames) {
      contextBlocks.push({
        role: "user",
        content: `EXISTING ${label.toUpperCase()} (Do not repeat):\n${existingNames}`,
      });
    }

    const messages = contextBuilder(
      baseContext.systemMsg,
      {
        role: "user",
        content: `Generate a list of 5-10 new, unique names/subjects for the category '${label}'.
${config?.listGenerationInstruction || ""}
Output ONLY the names, separated by newlines, no other text.`,
      },
      {
        role: "assistant",
        content: "",
      },
      contextBlocks,
    );

    return {
      messages,
      params: {
        temperature: 1.2,
        min_p: 0.1,
        presence_penalty: 0.1,
        maxTokens: 512,
        minTokens: 10,
      },
      prefixBehavior: "trim",
    };
  }

  async buildDulfsContentContext(
    fieldId: string,
    itemId: string,
  ): Promise<StrategyResult> {
    const systemPrompt = (await api.v1.config.get("system_prompt")) || "";
    const storyPrompt = this.storyManager.getFieldContent(FieldID.StoryPrompt);
    const setting = this.storyManager.getSetting();
    const worldSnapshot = this.storyManager.getFieldContent(
      FieldID.WorldSnapshot,
    );
    const existingDulfs = buildDulfsContextString(
      this.storyManager,
      fieldId,
    );

    const list = this.storyManager.getDulfsList(fieldId);
    const item = list.find((i) => i.id === itemId);
    if (!item) throw new Error("Item not found");

    const itemName = item.name;
    const config = FIELD_CONFIGS.find((c) => c.id === fieldId);
    const label = config ? config.label : fieldId;

    const prefill =
      fieldId === FieldID.DramatisPersonae ? `${itemName} (` : `${itemName}: `;

    const baseContext = {
      systemMsg: {
        role: "system" as const,
        content: systemPrompt,
      },
      storyPrompt: storyPrompt,
    };

    const storyContext = await this.getStoryContextMessages(4000);

    const contextBlocks: Message[] = [
      ...storyContext,
      {
        role: "user",
        content: `STORY PROMPT:\n${storyPrompt}`,
      },
      {
        role: "user",
        content: `SETTING:\n${setting}`,
      },
      {
        role: "user",
        content: `WORLD SNAPSHOT:\n${worldSnapshot}`,
      },
      {
        role: "user",
        content: `BRAINSTORM MATERIAL:\n${this.storyManager.getConsolidatedBrainstorm()}`,
      },
    ];

    if (existingDulfs) {
      contextBlocks.push({
        role: "user",
        content: `OTHER ESTABLISHED WORLD ELEMENTS:\n${existingDulfs}`,
      });
    }

    const messages = contextBuilder(
      baseContext.systemMsg,
      {
        role: "user",
        content: `Complete the details for the ${label} entry named "${itemName}".
${config?.generationInstruction || ""}
${config?.exampleFormat ? `Format: ${config.exampleFormat}` : ""}
Keep the description concise and focused on narrative potential.`,
      },
      {
        role: "assistant",
        content: prefill,
      },
      contextBlocks,
    );

    const result: StrategyResult = {
      messages,
      params: {
        temperature: 0.85,
        min_p: 0.05,
        presence_penalty: 0.05,
        maxTokens: 1024,
        minTokens: 20,
      },
      filters: [Filters.scrubMarkdown],
      prefixBehavior: "keep",
    };

    return result;
  }

  async buildDulfsSummaryContext(fieldId: string): Promise<StrategyResult> {
    const systemPrompt = (await api.v1.config.get("system_prompt")) || "";
    const storyPrompt = this.storyManager.getFieldContent(FieldID.StoryPrompt);
    const setting = this.storyManager.getSetting();

    const list = this.storyManager.getDulfsList(fieldId);
    let allContent = "";
    let count = 0;

    for (const item of list) {
      // Use lorebookContent primarily
      const content = item.lorebookContent || item.content || "";
      // Only include if content is substantial
      if (content.trim().length > 10) {
        allContent += `--- ${item.name} ---\n${content}\n\n`;
        count++;
      }
    }

    if (count === 0) {
      // No content to summarize
      // Return a dummy result that produces an empty or status message
      return {
        messages: [
          { role: "system", content: "No content available to summarize." },
        ],
        params: { maxTokens: 10 },
      };
    }

    let instruction = "";
    if (fieldId === FieldID.DramatisPersonae) {
      instruction = `Summarize each character in a SINGLE terse line using this exact format:
- {Full Name} ({Gender}, {Age}, {Role}): {Very concise summary of function/conflict}

Example:
- John Doe (Male, 34, Detective): Cynical investigator obsessed with the case, battling alcoholism.`;
    } else {
      instruction = `Summarize each entry in a SINGLE terse line using this exact format:
- {Name}: {Very concise summary of definition/function}

Example:
- The Spire: Central governace hub, source of the city's power grid.`;
    }

    const messages = contextBuilder(
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `You are a summarization engine.
${instruction}

Constraint: Do not include entries that are not listed in the DATA below.
Constraint: Be extremely brief. No flowery language.

DATA:
${allContent}`,
      },
      {
        role: "assistant",
        content: "", // Empty assistant to start fresh
      },
      [
        { role: "user", content: `STORY PROMPT:\n${storyPrompt}` },
        { role: "user", content: `SETTING:\n${setting}` },
      ],
    );

    return {
      messages,
      params: {
        temperature: 0.5, // Lower temperature for strict formatting
        min_p: 0.1,
        presence_penalty: 0.0,
        maxTokens: 1024,
      },
      prefixBehavior: "trim",
    };
  }

  private getStrategyKey(session: FieldSession): string {
    if (session.fieldId.includes(":")) return "generate:lorebook";
    if (session.fieldId === FieldID.StoryPrompt) return "generate:storyPrompt";
    if (session.fieldId === FieldID.WorldSnapshot)
      return "generate:worldSnapshot";
    if (session.fieldId === FieldID.ATTG) return "generate:attg";
    if (session.fieldId === FieldID.Style) return "generate:style";
    return "generate:default";
  }
}
