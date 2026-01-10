import { StoryManager } from "./story-manager";
import { hyperGenerate } from "../../lib/hyper-generator";
import { buildDulfsContextString } from "./context-strategies";
import { FieldID } from "../config/field-definitions";

export class BrainstormService {
  private storyManager: StoryManager;

  constructor(storyManager: StoryManager) {
    this.storyManager = storyManager;
  }

  public async sendChat(
    userMessage: string,
    onDelta: (text: string) => void,
  ): Promise<void> {
    const isInitialOrEmpty = !userMessage.trim();

    // 1. Add User Message to History if not empty
    if (!isInitialOrEmpty) {
      this.storyManager.addBrainstormMessage("user", userMessage);
      await this.storyManager.saveStoryData(false);
    }

    await this.generateResponse(isInitialOrEmpty, onDelta);
  }

  public async editMessage(index: number, newContent: string): Promise<void> {
    const history = this.storyManager.getBrainstormMessages();
    if (index >= 0 && index < history.length) {
      history[index].content = newContent;
      this.storyManager.setBrainstormMessages(history);
      await this.storyManager.saveStoryData(true);
    }
  }

  public async deleteMessage(index: number): Promise<void> {
    const history = this.storyManager.getBrainstormMessages();
    if (index >= 0 && index < history.length) {
      history.splice(index, 1);
      this.storyManager.setBrainstormMessages(history);
      await this.storyManager.saveStoryData(true);
    }
  }

  public async retryMessage(
    index: number,
    onDelta: (text: string) => void,
  ): Promise<void> {
    const history = this.storyManager.getBrainstormMessages();
    if (index < 0 || index >= history.length) return;

    // We want to regenerate the message at 'index'.
    // Logic:
    // 1. If it's an Assistant message:
    //    We remove it (and anything after it? - Standard behavior is truncate future)
    //    Then we generate a response to the history ending at index-1.
    // 2. If it's a User message:
    //    We shouldn't "retry" a user message in the sense of AI generation.
    //    The user probably wants to "Regenerate response TO this message".
    //    So we truncate history to 'index' (inclusive), keeping this user message.
    //    Then we generate.

    const msg = history[index];

    if (msg.role === "assistant") {
      // Truncate to index-1 (removing this assistant message and any following)
      const newHistory = history.slice(0, index);
      this.storyManager.setBrainstormMessages(newHistory);
      await this.storyManager.saveStoryData(true);

      // Generate
      await this.generateResponse(false, onDelta);
    } else {
      // User message: Truncate to index (keeping this message) and removing subsequent
      const newHistory = history.slice(0, index + 1);
      this.storyManager.setBrainstormMessages(newHistory);
      await this.storyManager.saveStoryData(true);

      // Generate
      await this.generateResponse(false, onDelta);
    }
  }

  private async generateResponse(
    isInitialOrEmpty: boolean,
    onDelta: (text: string) => void,
  ): Promise<void> {
    // 2. Prepare Context
    const storyPrompt = this.storyManager.getFieldContent(FieldID.StoryPrompt);
    const worldSnapshot = this.storyManager.getFieldContent(
      FieldID.WorldSnapshot,
    );
    const attg = this.storyManager.getFieldContent(FieldID.ATTG);
    const style = this.storyManager.getFieldContent(FieldID.Style);
    const dulfsContext = buildDulfsContextString(this.storyManager, "short");

    const systemPrompt = (await api.v1.config.get("system_prompt")) || "";

    // Get history
    const history = this.storyManager.getBrainstormMessages();

    // Build Prompt
    const brainstormPrompt =
      (await api.v1.config.get("brainstorm_prompt")) || "";
    const messages = this.buildPrompt(
      systemPrompt,
      brainstormPrompt,
      { storyPrompt, worldSnapshot, attg, style, dulfsContext },
      history,
      isInitialOrEmpty,
    );

    let fullResponse = "";
    const cancellationSignal = await api.v1.createCancellationSignal();
    const model = (await api.v1.config.get("model")) || "glm-4-6";

    try {
      await hyperGenerate(
        messages,
        {
          maxTokens: 300,
          minTokens: 10,
          model,
          temperature: 1,
        },
        (text) => {
          fullResponse += text;
          onDelta(fullResponse);
        },
        "background",
        cancellationSignal,
      );

      // 3. Add Assistant Message to History
      this.storyManager.addBrainstormMessage("assistant", fullResponse);
      await this.storyManager.saveStoryData(true); // Save and notify UI
    } catch (e) {
      api.v1.log("Brainstorm generation failed", e);
      throw e;
    }
  }

  public async clearHistory(): Promise<void> {
    this.storyManager.setBrainstormMessages([]);
    await this.storyManager.saveStoryData(true);
  }

  private buildPrompt(
    systemPrompt: string,
    brainstormPrompt: string,
    context: {
      storyPrompt: string;
      worldSnapshot: string;
      attg: string;
      style: string;
      dulfsContext: string;
    },
    history: { role: string; content: string }[],
    isInitialOrEmpty: boolean,
  ): any[] {
    const systemMsg = `${systemPrompt}\n\n[BRAINSTORMING MODE]\n${brainstormPrompt}`;

    const messages: any[] = [{ role: "system", content: systemMsg }];

    // Build Context Block
    let contextBlock = "Here is the current state of the story:\n";
    let hasContext = false;

    if (context.storyPrompt) {
      contextBlock += `STORY PROMPT:\n${context.storyPrompt}\n\n`;
      hasContext = true;
    }
    if (context.worldSnapshot) {
      contextBlock += `WORLD SNAPSHOT:\n${context.worldSnapshot}\n\n`;
      hasContext = true;
    }
    if (context.attg) {
      contextBlock += `ATTG:\n${context.attg}\n\n`;
      hasContext = true;
    }
    if (context.style) {
      contextBlock += `STYLE:\n${context.style}\n\n`;
      hasContext = true;
    }
    if (context.dulfsContext) {
      contextBlock += `ESTABLISHED WORLD ELEMENTS:\n${context.dulfsContext}\n\n`;
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
      messages.push({ role: msg.role, content: msg.content });
    });

    // If empty send, add a nudge
    if (isInitialOrEmpty) {
      messages.push({
        role: "user",
        content:
          "Continue brainstorming on your own. Surprise me with some new ideas or deep-dives into the existing ones.",
      });
    }

    return messages;
  }
}
