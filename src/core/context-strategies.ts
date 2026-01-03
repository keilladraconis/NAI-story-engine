import {
  hyperContextBuilder,
  HyperGenerationParams,
} from "../hyper-generator";
import { StoryManager } from "./story-manager";
import { FieldSession } from "./agent-cycle";

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

const Strategies: Record<string, StrategyFn> = {
  // Generate (Default / Brainstorm) - The Ideator
  // High creativity, divergent thinking
  "generate:default": async (session, manager, base) => {
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
        maxTokens: 1024,
      },
    };
  },

  // Generate (Dynamic World Snapshot) - The Architect
  // Balanced structure and creativity
  "generate:worldSnapshot": async (session, manager, base) => {
    const userPrompt = (await api.v1.config.get("world_snapshot_prompt")) || "";
    const brainstormContent = manager.getFieldContent("brainstorm");
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
  "review:default": async (session, manager, base) => {
    const userPrompt = (await api.v1.config.get("critique_prompt")) || "";
    const contentToReview = session.cycles.generate.content;
    const messages = hyperContextBuilder(
      base.systemMsg,
      { role: "user", content: fixSpacing(userPrompt) },
      {
        role: "assistant",
        content:
          "I have annotated the text with tags. Here is the marked-up content:",
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
        temperature: 0.4,
        min_p: 0.02,
        repetition_penalty: 1.2,
        frequency_penalty: 0.1,
        maxTokens: 2048,
      },
    };
  },

  // Refine - The Polisher
  // Standard temperature for fluid prose, low repetition penalty for style
  "refine:default": async (session, manager, base) => {
    const userPrompt = (await api.v1.config.get("refine_prompt")) || "";
    const contentToRefine = session.cycles.generate.content;
    const critique = session.cycles.review.content;
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
        { role: "user", content: fixSpacing(`CRITIQUE:\n${critique}`) },
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
    const storyPrompt = this.storyManager.getFieldContent("storyPrompt");

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
      if (session.fieldId === "worldSnapshot") return "generate:worldSnapshot";
      return "generate:default";
    }
    return `${stage}:default`;
  }
}
