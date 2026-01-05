import { hyperContextBuilder, HyperGenerationParams } from "../hyper-generator";
import { StoryManager } from "./story-manager";
import { FieldSession } from "./agent-cycle";
import { FieldID } from "../config/field-definitions";

export interface StrategyResult {
  messages: Message[];
  params: Partial<HyperGenerationParams>;
}

type StrategyFn = (
  session: FieldSession,
  manager: StoryManager,
  base: { systemMsg: Message; storyPrompt: string },
) => Promise<StrategyResult>;

const fixSpacing = (text: string): string => {
  if (!text) return "";
  // Strictly double every newline character for GLM-4.6 compatibility
  return text.replace(/\n/g, "\n\n").trim();
};

const normalizeQuotes = (str: string): string => {
  return str.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');
};

const applyReviewTags = (original: string, review: string): string => {
  if (!review) return original;

  const lines = review.split("\n");
  const patches: { index: number; tag: string }[] = [];
  const normalizedOriginal = normalizeQuotes(original);

  for (const line of lines) {
    // Match [TAG] || "locator", optionally with markdown bolding around the tag
    const match = line.match(/^(\*\*)?\[([A-Z_]+)\](\*\*)?\s*\|\|\s*"(.*)"$/);
    if (match) {
      const tag = match[2];
      const locator = normalizeQuotes(match[4]);

      // Find the occurrence using normalized versions
      const idx = normalizedOriginal.indexOf(locator);
      if (idx !== -1) {
        patches.push({ index: idx, tag: `[${tag}] ` });
      }
    }
  }

  // Sort by index descending to avoid shifting indices when inserting
  patches.sort((a, b) => b.index - a.index);

  let patched = original;
  for (const patch of patches) {
    patched =
      patched.slice(0, patch.index) + patch.tag + patched.slice(patch.index);
  }
  return patched;
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
        repetition_penalty: 1.05,
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
        repetition_penalty: 1.1,
        maxTokens: 1536,
      },
    };
  },

  // Review - The Editor
  // Low temperature for analytical precision, high repetition penalty to prevent outputting the story
  "review:default": async (session, _manager, base) => {
    const userPrompt = (await api.v1.config.get("critique_prompt")) || "";
    const contentToReview = session.cycles.generate.content;
    const messages = hyperContextBuilder(
      base.systemMsg,
      { role: "user", content: fixSpacing(userPrompt) },
      {
        role: "assistant",
        content:
          "I will review the text and provide structured directives in the format '[TAG] || \"locator substring\"':\n",
      },
      [
        {
          role: "user",
          content: fixSpacing(`STORY PROMPT:\n${base.storyPrompt}`),
        },
        {
          role: "assistant",
          content: fixSpacing(`CONTENT TO REVIEW:\n${contentToReview}`),
        },
      ],
    );
    return {
      messages,
      params: {
        temperature: 0.3,
        min_p: 0.02,
        repetition_penalty: 1.1,
        frequency_penalty: 0.1,
        maxTokens: 1024,
      },
    };
  },

  // Refine - The Polisher
  // Standard temperature for fluid prose, low repetition penalty for style
  "refine:default": async (session, _manager, base) => {
    const userPrompt = (await api.v1.config.get("refine_prompt")) || "";
    const contentToRefine = session.cycles.generate.content;
    const critique = session.cycles.review.content;
    const patchedContent = applyReviewTags(contentToRefine, critique);
    api.v1.log(`[ContextStrategy] Patched content for Refine:\n${patchedContent}`);

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
          content: fixSpacing(`DRAFT CONTENT:\n${patchedContent}`),
        },
        // { role: "user", content: fixSpacing(`CRITIQUE:\n${critique}`) },
      ],
    );
    return {
      messages,
      params: {
        temperature: 0.8,
        min_p: 0.02,
        repetition_penalty: 1.02,
        maxTokens: 2048,
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

  private getStrategyKey(session: FieldSession): string {
    const stage = session.selectedStage;
    if (stage === "generate") {
      if (session.fieldId === FieldID.WorldSnapshot) return "generate:worldSnapshot";
      return "generate:default";
    }
    return `${stage}:default`;
  }
}
