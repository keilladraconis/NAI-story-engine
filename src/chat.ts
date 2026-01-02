import { hyperContextBuilder, hyperGenerate } from "./hyper-generator";
import type {
  OnBudgetWaitCallback,
  OnBudgetResumeCallback,
} from "./hyper-generator";

const { log } = api.v1;
const { get, set } = api.v1.storyStorage;
const { get: getConfig } = api.v1.config;

// Types
interface Agent {
  maxTokens: number;
  userPrompt: string;
  slug: string;
  icon: IconId;

  // Generation parameters
  temperature: number;
  top_p: number;
  top_k: number;
  min_p: number;
  frequency_penalty: number;
  presence_penalty: number;
  stop: ["###", "---"];

  title(): string;
  header(): string;
  load(): Promise<void>;
}

abstract class Agent implements Agent {
  maxTokens = 2048;
  temperature = 1.0;
  top_p = 0.95;
  top_k = 0; // Intentionally disable in favor of top_p and min_p.
  min_p = 0;
  presence_penalty = 0;
  frequency_penalty = 0;

  userPrompt = "";

  title() {
    return this.slug.charAt(0).toUpperCase() + this.slug.slice(1);
  }

  header() {
    return `\n\n----\n**${this.title()}**\n\n`;
  }

  async load() {
    const prompt = await getConfig(`${this.slug}_prompt`);
    if (prompt) this.userPrompt = prompt;
  }
}

class BrainstormAgent extends Agent {
  maxTokens = 1024;
  temperature = 1.1;
  presence_penalty = 0.7;

  slug = "brainstorm";
  icon: IconId = "cloud-lightning";
}

class CritiqueAgent extends Agent {
  maxTokens = 800;
  temperature = 0.3;
  top_p = 0.7;
  presence_penalty = 0.2;
  frequency_penalty = 0.3;

  slug = "critique";
  icon: IconId = "flag";
}

class RefineAgent extends Agent {
  maxTokens = 1500;
  temperature = 0.5;
  top_p = 0.8;
  presence_penalty = 0.4;
  frequency_penalty = 0.1;

  slug = "refine";
  icon: IconId = "pen-tool";
}

class SummaryAgent extends Agent {
  maxTokens = 2500;
  temperature = 0.8;
  presence_penalty = 1.2;
  frequency_penalty = 0.1;

  slug = "summary";
  icon: IconId = "package";
}

const AGENTS = [BrainstormAgent, CritiqueAgent, RefineAgent, SummaryAgent];

/**
 * Utilities
 */

const setInterval = (
  callback: Function,
  interval: number,
): (() => Promise<void>) => {
  let timerId: number;

  const tick = async () => {
    timerId = await api.v1.timers.setTimeout(() => {
      callback(clear);
      tick();
    }, interval);
  };

  const clear = async () => api.v1.timers.clearTimeout(timerId);

  tick();

  return clear;
};

const currentEpochS = () => Math.floor(Date.now() / 1000);

export class Chat {
  // Constants
  static CHAT_HISTORY_KEY = "kse-chat-history";
  static AUTO_FLOW = {
    brainstorm: "critique",
    critique: "refine",
    refine: "summary",
    summary: "brainstorm",
  };

  // Properties
  messages: Message[] = [];
  isGenerating = false;
  waitTime = 0;
  minTokens = 25;
  systemPrompt = "";
  autoMode = false;
  agents: Agent[];
  agent: Agent;
  clearInterval = async () => {};
  cancelSignal: CancellationSignal | undefined = undefined;
  lastResponder: string = "user";
  synopsisId: string;

  constructor(synopsisId: string) {
    this.agents = [BrainstormAgent, CritiqueAgent, RefineAgent].map(
      (a) => new a(),
    );
    this.agent = this.agents[0];
    this.synopsisId = synopsisId;
  }

  // Hooks
  onUpdate = (_chat: Chat) => {};
  onBudgetWait: OnBudgetWaitCallback = async () => {};

  // Handlers
  handleClear = () => {
    this.messages = [];
    this.isGenerating = false;
    this.agent = this.agents[0];
    this.save();
    this.load();
  };

  handleStreamMessage = (text: string, final: boolean) => {
    const messageToAppend = this.messages.at(-1)!;
    messageToAppend.content += text;
    if (final) {
      // Add trailing whitespace to the end of the message if needed
      if (!/\s$/.test(messageToAppend.content!))
        messageToAppend.content = messageToAppend.content + " ";
      this.save();
    } else {
      this.onUpdate(this);
    }
  };
  handleAgentSwitch = (role: string) => {
    if (this.agent.slug == role) return;
    this.agent = this.agents.find((a) => a.slug == role)!;
    this.onUpdate(this);
  };

  handleSendMessage = (content: string) => {
    if (content.length > 0) {
      this.addMessage("user", content + "\n");
      this.lastResponder = "user";
    }
    if (this.lastResponder != this.agent.slug) {
      this.addMessage("assistant", this.agent.header());
    }
    this.generateResponse();
  };

  // Really, the interval is not reliable as a clock, so we have to capture the current epoch seconds
  handleBudgetWait: OnBudgetWaitCallback = async (
    available: number,
    needed: number,
    time: number,
  ) => {
    // Ensure that if there's an old interval we clear it.
    await this.clearInterval();

    const waitEnd = currentEpochS() + Math.floor(time / 1000);
    this.onBudgetWait(available, needed, time);

    this.clearInterval = setInterval((clear: Function) => {
      this.waitTime = waitEnd - currentEpochS();
      if (this.waitTime <= 0) clear();
      this.onUpdate(this);
    }, 1000);
  };

  handleBudgetResume: OnBudgetResumeCallback | undefined = () => {
    this.clearInterval();
    this.waitTime = 0;
  };

  handleCancel = () => {
    if (this.cancelSignal) this.cancelSignal.cancel();
    this.autoMode = false;
  };

  handleAuto = (value: boolean) => {
    this.autoMode = value;
    // When auto mode is switched off, fire cancellation signal and clear the interval and waitTime.
    if (!this.autoMode) {
      this.clearInterval();
      this.cancelSignal?.cancel();
      this.waitTime = 0;
      this.isGenerating = false;
    }
  };

  // Functions
  async load() {
    return Promise.all([
      get(Chat.CHAT_HISTORY_KEY)
        .then((history) => (this.messages = JSON.parse(history)))
        .catch(() => (this.messages = [])),
      getConfig("system_prompt").then(
        (systemPrompt: string) => (this.systemPrompt = systemPrompt),
      ),
      this.agents.map((a) => a.load()),
    ]);
  }

  save() {
    this.messages = this.messages.filter(
      (m) => m.content && m.content.length > 0,
    );
    set(Chat.CHAT_HISTORY_KEY, JSON.stringify(this.messages)).then(() => {
      this.onUpdate(this);
    });
  }

  addMessage(role: Message["role"], content: string) {
    if (content.length <= 0) return;
    this.messages.push({
      role,
      content,
    });
    this.save();
  }

  autoModeFlow() {
    if (!this.autoMode) return;

    if (this.lastResponder == "summary") {
      this.autoMode = false;
    } else {
      const next =
        Chat.AUTO_FLOW[this.lastResponder as keyof typeof Chat.AUTO_FLOW];
      this.handleAgentSwitch(next);
      this.handleSendMessage("");
    }
  }

  private async generateResponse() {
    const context = hyperContextBuilder(
      {
        role: "system",
        content: this.systemPrompt.replaceAll("\n", "\n\n") + "\n\n", //  Our prompts need to be double-spaced for GLM.
      },
      {
        role: "user",
        content: `${this.agent.userPrompt.replaceAll("\n", "\n\n")}\n\nLimit your response to ${Math.floor(this.agent.maxTokens / 1.5)} words.\n\n`,
      },
      {
        role: "assistant",
        content: `Understood.\n\n[Continuing:]\n`,
      },
      this.messages,
    );

    this.isGenerating = true;
    this.lastResponder = this.agent.slug;
    this.cancelSignal = await api.v1.createCancellationSignal();

    try {
      const response = await hyperGenerate(
        context,
        {
          minTokens: 50,
          maxTokens: this.agent.maxTokens,
          onBudgetWait: this.handleBudgetWait,
          onBudgetResume: this.handleBudgetResume,
          temperature: this.agent.temperature,
          top_p: this.agent.top_p,
          top_k: this.agent.top_k,
          min_p: this.agent.min_p,
          presence_penalty: this.agent.presence_penalty,
          frequency_penalty: this.agent.frequency_penalty,
        },
        this.handleStreamMessage,
        "background",
        this.cancelSignal,
      );

      this.isGenerating = false;
      this.cancelSignal.dispose();
      log("Generated:", response);
      this.onUpdate(this);
      this.save();
      this.autoModeFlow();
    } catch (error: any) {
      api.v1.log("Generation failed:", error);
    }
  }
}
