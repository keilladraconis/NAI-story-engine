import {
  hyperContextBuilder,
  HyperGenerationParams,
} from "../../lib/hyper-generator";
import { StoryManager } from "./story-manager";
import { FieldSession } from "./agent-workflow";
import {
  FieldID,
  FIELD_CONFIGS,
  LIST_FIELD_IDS,
} from "../config/field-definitions";

export interface StrategyResult {
  messages: Message[];
  params: Partial<HyperGenerationParams>;
}

type StrategyFn = (
  session: FieldSession,
  manager: StoryManager,
  base: { systemMsg: Message; storyPrompt: string },
) => Promise<StrategyResult>;

const buildDulfsContextString = (
  manager: StoryManager,
  mode: "short" | "full",
  excludeId?: string,
): string => {
  let context = "";
  for (const fid of LIST_FIELD_IDS) {
    if (fid === excludeId) continue;
    const list = manager.getDulfsList(fid);
    if (list.length === 0) continue;

    const config = FIELD_CONFIGS.find((c) => c.id === fid);
    const label = config ? config.label.toUpperCase() : fid.toUpperCase();

    if (mode === "short") {
      context += `${label}: ${list.map((i) => i.name).join(", ")}\n`;
    } else {
      context += `${label}:\n${list.map((i) => `- ${i.content}`).join("\n")}\n\n`;
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
    const messages = hyperContextBuilder(
      base.systemMsg,
      { role: "user", content: userPrompt },
      {
        role: "assistant",
        content:
          "I will explore the narrative vectors and three-sphere frictions:",
      },
      [
        {
          role: "user",
          content: `STORY PROMPT:\n${base.storyPrompt}`,
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
    };
  },

  // Generate (Story Prompt) - The Initiator
  // Takes brainstorm chat and turns it into a high-level premise
  "generate:storyPrompt": async (_session, manager, base) => {
    const userPrompt = (await api.v1.config.get("story_prompt_generate_prompt")) || "";
    const brainstormContent = manager.getConsolidatedBrainstorm();
    const messages = hyperContextBuilder(
      base.systemMsg,
      { role: "user", content: userPrompt },
      {
        role: "assistant",
        content:
          "Here is the story prompt based on our brainstorming session:",
      },
      [
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
    };
  },

  // Generate (Dynamic World Snapshot) - The Architect
  // Balanced structure and creativity
  "generate:worldSnapshot": async (_session, manager, base) => {
    const userPrompt = (await api.v1.config.get("world_snapshot_prompt")) || "";
    const brainstormContent = manager.getConsolidatedBrainstorm();
    const messages = hyperContextBuilder(
      base.systemMsg,
      { role: "user", content: userPrompt },
      {
        role: "assistant",
        content:
          "Here is the dynamic world snapshot, focusing on drivers and tensions:",
      },
      [
        {
          role: "user",
          content: `STORY PROMPT:\n${base.storyPrompt}`,
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
    };
  },

  // Generate (ATTG)
  "generate:attg": async (_session, _manager, base) => {
    const userPrompt = (await api.v1.config.get("attg_generate_prompt")) || "";
    const messages = hyperContextBuilder(
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
        {
          role: "user",
          content: `STORY PROMPT:\n${base.storyPrompt}`,
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
  "generate:style": async (_session, _manager, base) => {
    const userPrompt = (await api.v1.config.get("style_generate_prompt")) || "";
    const messages = hyperContextBuilder(
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
        {
          role: "user",
          content: `STORY PROMPT:\n${base.storyPrompt}`,
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

    if (session.fieldId.startsWith("lorebook:")) {
      const entryId = session.fieldId.split(":")[1];
      const match = manager.findDulfsByLorebookId(entryId);
      if (match) {
        itemName = match.item.name;
        itemDesc = match.item.content;
      }
    } else {
      const [fieldId, itemId] = session.fieldId.split(":");
      const list = manager.getDulfsList(fieldId);
      const item = list.find((i) => i.id === itemId);
      if (item) {
        itemName = item.name;
        itemDesc = item.content;
      }
    }

    const configPrompt =
      (await api.v1.config.get("lorebook_generate_prompt")) || "";
    const formatInstruction = configPrompt.replace("[itemName]", itemName);

    const messages = hyperContextBuilder(
      base.systemMsg,
      { role: "user", content: formatInstruction },
      {
        role: "assistant",
        content: `${itemName}\n`,
      },
      [
        {
          role: "user",
          content: `STORY PROMPT:\n${base.storyPrompt}`,
        },
        {
          role: "user",
          content:
            `ENTITY DATA:\nName: ${itemName}\nDescription: ${itemDesc}`,
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
    };
  },
};

export class ContextStrategyFactory {
  constructor(private storyManager: StoryManager) {}

  async build(session: FieldSession): Promise<StrategyResult> {
    const systemPrompt = (await api.v1.config.get("system_prompt")) || "";
    const storyPrompt = this.storyManager.getFieldContent(FieldID.StoryPrompt);

    const baseContext = {
      systemMsg: {
        role: "system" as const,
        content: systemPrompt,
      },
      storyPrompt: storyPrompt,
    };

    const key = this.getStrategyKey(session);
    const strategy = Strategies[key] || Strategies["generate:default"];

    return strategy(session, this.storyManager, baseContext);
  }

  async buildDulfsContext(fieldId: string): Promise<StrategyResult> {
    const systemPrompt = (await api.v1.config.get("system_prompt")) || "";
    const storyPrompt = this.storyManager.getFieldContent(FieldID.StoryPrompt);
    const worldSnapshot = this.storyManager.getFieldContent(
      FieldID.WorldSnapshot,
    );
    const existingDulfs = buildDulfsContextString(
      this.storyManager,
      "full",
      fieldId,
    );

    const baseContext = {
      systemMsg: {
        role: "system" as const,
        content: systemPrompt,
      },
    };

    const config = FIELD_CONFIGS.find((c) => c.id === fieldId);
    const userInstruction =
      config?.generationInstruction ||
      "Generate a list of items for this category.";
    const exampleFormat =
      config?.exampleFormat ||
      "Format each line as: [Item Name]: [Description]";

    // Build context blocks
    const contextBlocks: Message[] = [
      {
        role: "user",
        content: `STORY PROMPT:\n${storyPrompt}`,
      },
      {
        role: "user",
        content: `WORLD SNAPSHOT:\n${worldSnapshot}`,
      },
    ];

    if (existingDulfs) {
      contextBlocks.push({
        role: "user",
        content: `EXISTING WORLD ELEMENTS:\n${existingDulfs}`,
      });
    }

    const messages = hyperContextBuilder(
      baseContext.systemMsg,
      {
        role: "user",
        content: `${userInstruction}\n${exampleFormat}`,
      },
      {
        role: "assistant",
        content: "Here is the list of items:\n",
      },
      contextBlocks,
    );

    return {
      messages,
      params: {
        temperature: 1.2,
        min_p: 0.05,
        presence_penalty: 0.05,
        maxTokens: 1024,
      },
    };
  }

  private getStrategyKey(session: FieldSession): string {
    if (session.fieldId.includes(":")) return "generate:lorebook";
    if (session.fieldId === FieldID.StoryPrompt)
      return "generate:storyPrompt";
    if (session.fieldId === FieldID.WorldSnapshot)
      return "generate:worldSnapshot";
    if (session.fieldId === FieldID.ATTG) return "generate:attg";
    if (session.fieldId === FieldID.Style) return "generate:style";
    return "generate:default";
  }
}
