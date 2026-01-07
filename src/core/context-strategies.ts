import {
  hyperContextBuilder,
  HyperGenerationParams,
} from "../../lib/hyper-generator";
import { StoryManager } from "./story-manager";
import { FieldSession } from "./agent-cycle";
import { FieldID, FIELD_CONFIGS } from "../config/field-definitions";

export interface StrategyResult {
  messages: Message[];
  params: Partial<HyperGenerationParams>;
}

type StrategyFn = (
  session: FieldSession,
  manager: StoryManager,
  base: { systemMsg: Message; storyPrompt: string },
) => Promise<StrategyResult>;

/**
 * Strictly double every newline character.
 * This is required for GLM-4.6 compatibility as it tends to collapse single newlines
 * in certain prompt contexts, leading to merged blocks of text.
 */
const fixSpacing = (text: string): string => {
  if (!text) return "";
  // Strictly double every newline character for GLM-4.6 compatibility
  return text.replace(/\n/g, "\n\n").trim();
};

const getShortDulfsContext = (manager: StoryManager): string => {
  const fields = [
    FieldID.DramatisPersonae,
    FieldID.UniverseSystems,
    FieldID.Locations,
    FieldID.Factions,
    FieldID.SituationalDynamics,
  ];

  let context = "";
  for (const fid of fields) {
    const list = manager.getDulfsList(fid);
    if (list.length > 0) {
      const config = FIELD_CONFIGS.find((c) => c.id === fid);
      const label = config ? config.label.toUpperCase() : fid.toUpperCase();
      context += `${label}: ${list.map((i) => i.name).join(", ")}\n`;
    }
  }
  return context.trim();
};

export const normalizeQuotes = (str: string): string => {
  return str.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');
};

const getAllDulfsContext = (
  manager: StoryManager,
  excludeFieldId: string,
): string => {
  const fields = [
    FieldID.DramatisPersonae,
    FieldID.UniverseSystems,
    FieldID.Locations,
    FieldID.Factions,
    FieldID.SituationalDynamics,
  ];

  let context = "";
  for (const fid of fields) {
    if (fid === excludeFieldId) continue;
    const list = manager.getDulfsList(fid);
    if (list.length > 0) {
      const config = FIELD_CONFIGS.find((c) => c.id === fid);
      const label = config ? config.label.toUpperCase() : fid.toUpperCase();
      context += `${label}:\n${list.map((i) => `- ${i.content}`).join("\n")}\n\n`;
    }
  }
  return context.trim();
};

const Strategies: Record<string, StrategyFn> = {
  // Generate (Default / Brainstorm) - The Ideator
  // High creativity, divergent thinking
  "generate:default": async (_session, _manager, base) => {
    const userPrompt = (await api.v1.config.get("brainstorm_prompt")) || "";
    const messages = hyperContextBuilder(
      base.systemMsg,
      { role: "user", content: fixSpacing(userPrompt) },
      {
        role: "assistant",
        content:
          "I will explore the narrative vectors and three-sphere frictions:",
      },
      [
        {
          role: "user",
          content: fixSpacing(`STORY PROMPT:\n${base.storyPrompt}`),
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

  // Generate (Dynamic World Snapshot) - The Architect
  // Balanced structure and creativity
  "generate:worldSnapshot": async (_session, manager, base) => {
    const userPrompt = (await api.v1.config.get("world_snapshot_prompt")) || "";
    const brainstormContent = manager.getConsolidatedBrainstorm();
    const messages = hyperContextBuilder(
      base.systemMsg,
      { role: "user", content: fixSpacing(userPrompt) },
      {
        role: "assistant",
        content:
          "Here is the dynamic world snapshot, focusing on drivers and tensions:",
      },
      [
        {
          role: "user",
          content: fixSpacing(`STORY PROMPT:\n${base.storyPrompt}`),
        },
        {
          role: "user",
          content: fixSpacing(`BRAINSTORM MATERIAL:\n${brainstormContent}`),
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

  // Review - The Editor
  // Low temperature for analytical precision, high repetition penalty to prevent outputting the story
  "review:default": async (session, manager, base) => {
    let userPrompt = (await api.v1.config.get("critique_prompt")) || "";

    // If this is a lorebook entry, append specific critique instructions
    if (session.fieldId.includes(":")) {
      const lorebookCrit =
        (await api.v1.config.get("lorebook_critique_instructions")) || "";
      if (lorebookCrit) {
        userPrompt += "\n\n" + lorebookCrit;
      }
    }

    const contentToReview = session.cycles.generate.content;
    const worldSnapshot = manager.getFieldContent(FieldID.WorldSnapshot);
    const dulfs = getShortDulfsContext(manager);
    const config = FIELD_CONFIGS.find((c) => c.id === session.fieldId);
    const genInstruction =
      config?.generationInstruction || "Generate narrative content.";

    const messages = hyperContextBuilder(
      base.systemMsg,
      { role: "user", content: fixSpacing(userPrompt) },
      {
        role: "assistant",
        content:
          "I will review the text and provide structured directives in the format '[TAG] || \"locator substring\"'.\n" +
          "I will be highly selective, only tagging passages that truly need improvement.\n" +
          "I will use [FIX] for grammatical/syntactical errors and [LOGIC] for consistency, causal errors, or missing logical steps.\n" +
          "I will NOT tag passages for 'depth' or 'flavor' unless there is a logic error; I prioritize conciseness.\n",
      },
      [
        {
          role: "user",
          content: fixSpacing(`WORLD SNAPSHOT:\n${worldSnapshot}`),
        },
        {
          role: "user",
          content: fixSpacing(`WORLD ELEMENTS:\n${dulfs}`),
        },
        {
          role: "user",
          content: fixSpacing(`GENERATE INSTRUCTION:\n${genInstruction}`),
        },
        {
          role: "user",
          content: fixSpacing(`CONTENT TO REVIEW:\n${contentToReview}`),
        },
      ],
    );
    return {
      messages,
      params: {
        temperature: 0.3,
        min_p: 0.02,
        presence_penalty: 0.1,
        frequency_penalty: 0.02,
        maxTokens: 1024,
      },
    };
  },

  // Refine - The Polisher
  // Standard temperature for fluid prose, low repetition penalty for style
  "refine:default": async (session, manager, base) => {
    const userPrompt = (await api.v1.config.get("refine_prompt")) || "";
    const contentToRefine = manager.getFieldContent(session.fieldId);

    api.v1.log(
      `[ContextStrategy] Refining content length: ${contentToRefine.length}`,
    );

    const messages = hyperContextBuilder(
      base.systemMsg,
      { role: "user", content: fixSpacing(userPrompt) },
      {
        role: "assistant",
        content: "Here is the finalized text, stripped of tags and polished:",
      },
      [
        {
          role: "user",
          content: fixSpacing(`STORY PROMPT:\n${base.storyPrompt}`),
        },
        {
          role: "assistant",
          content: fixSpacing(`DRAFT CONTENT:\n${contentToRefine}`),
        },
        // { role: "user", content: fixSpacing(`CRITIQUE:\n${critique}`) },
      ],
    );
    return {
      messages,
      params: {
        temperature: 0.8,
        min_p: 0.02,
        presence_penalty: 0.02,
        maxTokens: 2048,
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
        content: fixSpacing(userPrompt),
      },
      {
        role: "assistant",
        content: "[ Author:",
      },
      [
        {
          role: "user",
          content: fixSpacing(`STORY PROMPT:\n${base.storyPrompt}`),
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
        content: fixSpacing(userPrompt),
      },
      {
        role: "assistant",
        content: "[ Write in a style that conveys the following:",
      },
      [
        {
          role: "user",
          content: fixSpacing(`STORY PROMPT:\n${base.storyPrompt}`),
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
      { role: "user", content: fixSpacing(formatInstruction) },
      {
        role: "assistant",
        content: `${itemName}\n`,
      },
      [
        {
          role: "user",
          content: fixSpacing(`STORY PROMPT:\n${base.storyPrompt}`),
        },
        {
          role: "user",
          content: fixSpacing(
            `ENTITY DATA:\nName: ${itemName}\nDescription: ${itemDesc}`,
          ),
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
        content: fixSpacing(systemPrompt),
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
    const existingDulfs = getAllDulfsContext(this.storyManager, fieldId);

    const baseContext = {
      systemMsg: {
        role: "system" as const,
        content: fixSpacing(systemPrompt),
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
        content: fixSpacing(`STORY PROMPT:\n${storyPrompt}`),
      },
      {
        role: "user",
        content: fixSpacing(`WORLD SNAPSHOT:\n${worldSnapshot}`),
      },
    ];

    if (existingDulfs) {
      contextBlocks.push({
        role: "user",
        content: fixSpacing(`EXISTING WORLD ELEMENTS:\n${existingDulfs}`),
      });
    }

    // Add current list content to avoid dupes?
    // Usually standard generation appends or fills.
    // For now we just give context.

    const messages = hyperContextBuilder(
      baseContext.systemMsg,
      {
        role: "user",
        content: fixSpacing(`${userInstruction}\n${exampleFormat}`),
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

  async buildRefinementPatchContext(
    session: FieldSession,
    tag: string,
    locator: string,
    prefill: string,
  ): Promise<StrategyResult> {
    const worldSnapshot = this.storyManager.getFieldContent(
      FieldID.WorldSnapshot,
    );
    const dulfs = getShortDulfsContext(this.storyManager);
    const storyPrompt = this.storyManager.getFieldContent(FieldID.StoryPrompt);

    const config = FIELD_CONFIGS.find((c) => c.id === session.fieldId);
    const genInstruction =
      config?.generationInstruction || "Generate narrative content.";
    const genOutput = session.cycles.generate.content;

    const refinementSystemPrompt = `You are a precision refinement agent. Your goal is to rewrite a SPECIFIC passage to address a critique tag.
CRITICAL RULES:
1. Output ONLY the replacement text for the targeted passage.
2. NO commentary, NO tags, NO quotes, NO markdown formatting (like bolding) unless it was already present.
3. Maintain the EXACT tone, style, and TENSE of the original.
4. DO NOT include any of the surrounding context in your output. Your replacement will be directly swapped into the original text.
5. BE CONCISE and PUNCHY. Do NOT add unnecessary detail or "depth".
6. If the tag is [DELETE], [REPETITION], [PLOTTING], or [FLUFF], providing an empty string or a significantly shorter version is often the correct action.`;

    const tagPrompts: Record<string, string> = {
      FIX: "Repair grammatical, syntactical, or formatting errors. DO NOT EXPAND.",
      LOGIC: "Repair causal logic or consistency errors. Ensure internal coherence.",
      PLOTTING:
        "Remove future scripting, inevitable outcomes, or forced plot. Replace with static tension, current character drivers, or environmental potential. Can be much shorter.",
      FLUFF:
        "Remove generic filler or purple prose. Retain core meaning while reducing length drastically.",
      REPETITION:
        "Remove or merge this redundant phrase. Output ONLY the necessary replacement (often much shorter or empty).",
      FORMAT: "Fix structural formatting to match requirements.",
    };

    const reviewInstruction =
      tagPrompts[tag] || `Refine this passage to address [${tag}].`;

    const messages = hyperContextBuilder(
      { role: "system", content: fixSpacing(refinementSystemPrompt) },
      {
        role: "user",
        content: fixSpacing(
          `CONTEXT BEFORE TARGET:\n...${prefill}\n\nREFINEMENT TARGET [${tag}]:\n"${locator}"\n\nINSTRUCTION:\n${reviewInstruction}\n\nExecute. Output ONLY the replacement text.`,
        ),
      },
      {
        role: "assistant",
        content: "REPLACEMENT TEXT:\n",
      },
      [
        {
          role: "user",
          content: fixSpacing(`STORY PROMPT:\n${storyPrompt}`),
        },
        {
          role: "user",
          content: fixSpacing(`WORLD SNAPSHOT:\n${worldSnapshot}`),
        },
        {
          role: "user",
          content: fixSpacing(`WORLD ELEMENTS:\n${dulfs}`),
        },
        {
          role: "user",
          content: fixSpacing(`GENERATE INSTRUCTION:\n${genInstruction}`),
        },
        {
          role: "user",
          content: fixSpacing(`GENERATE OUTPUT:\n${genOutput}`),
        },
      ],
    );

    return {
      messages,
      params: {
        temperature: 0.7,
        maxTokens: 512,
        minTokens: 2,
        stop: ["\n\n", "[", "<"], // Stop if it tries to escape or start a new tag
      },
    };
  }

  private getStrategyKey(session: FieldSession): string {
    const stage = session.selectedStage;
    if (stage === "generate") {
      if (session.fieldId.includes(":")) return "generate:lorebook";
      if (session.fieldId === FieldID.WorldSnapshot)
        return "generate:worldSnapshot";
      if (session.fieldId === FieldID.ATTG) return "generate:attg";
      if (session.fieldId === FieldID.Style) return "generate:style";
      return "generate:default";
    }
    return `${stage}:default`;
  }
}
