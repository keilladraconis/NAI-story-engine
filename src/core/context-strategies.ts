import { hyperContextBuilder } from "../hyper-generator";
import { StoryManager } from "./story-manager";
import { FieldSession } from "./agent-cycle";

type StrategyFn = (
  session: FieldSession,
  manager: StoryManager,
  base: { systemMsg: Message; storyPrompt: string },
) => Promise<Message[]>;

const fixSpacing = (text: string): string => {
  if (!text) return "";
  // Strictly double every newline character for GLM-4.6 compatibility
  return text.replace(/\n/g, "\n\n").trim();
};

const Strategies: Record<string, StrategyFn> = {
  // Generate (Default / Brainstorm)
  "generate:default": async (session, manager, base) => {
    const userPrompt = (await api.v1.config.get("brainstorm_prompt")) || "";
    return hyperContextBuilder(
      base.systemMsg,
      { role: "user", content: fixSpacing(userPrompt) },
      { role: "assistant", content: "" },
      [
        {
          role: "user",
          content: fixSpacing(`STORY PROMPT:\n${base.storyPrompt}`),
        },
      ],
    );
  },

  // Generate (Synopsis)
  "generate:synopsis": async (session, manager, base) => {
    const userPrompt = (await api.v1.config.get("synopsis_prompt")) || "";
    const brainstormContent = manager.getFieldContent("brainstorm");
    return hyperContextBuilder(
      base.systemMsg,
      { role: "user", content: fixSpacing(userPrompt) },
      { role: "assistant", content: "" },
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
  },

  // Review
  "review:default": async (session, manager, base) => {
    const userPrompt = (await api.v1.config.get("critique_prompt")) || "";
    const contentToReview = session.cycles.generate.content;
    return hyperContextBuilder(
      base.systemMsg,
      { role: "user", content: fixSpacing(userPrompt) },
      { role: "assistant", content: "" },
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
  },

  // Refine
  "refine:default": async (session, manager, base) => {
    const userPrompt = (await api.v1.config.get("refine_prompt")) || "";
    const contentToRefine = session.cycles.generate.content;
    const critique = session.cycles.review.content;
    return hyperContextBuilder(
      base.systemMsg,
      { role: "user", content: fixSpacing(userPrompt) },
      { role: "assistant", content: "" },
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
  },
};

export class ContextStrategyFactory {
  constructor(private storyManager: StoryManager) {}

  async build(session: FieldSession): Promise<Message[]> {
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
      if (session.fieldId === "synopsis") return "generate:synopsis";
      return "generate:default";
    }
    return `${stage}:default`;
  }
}
