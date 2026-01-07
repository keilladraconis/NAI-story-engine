import { StoryManager } from "./story-manager";
import { hyperGenerate } from "../../lib/hyper-generator";

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

    // 2. Prepare Context
    const storyPrompt = this.storyManager.getFieldContent("storyPrompt");
    const systemPrompt = (await api.v1.config.get("system_prompt")) || "";

    // Get history (includes the message we just added)
    const history = this.storyManager.getBrainstormMessages();

    // Build Prompt
    const brainstormPrompt =
      (await api.v1.config.get("brainstorm_prompt")) || "";
    const messages = this.buildPrompt(
      systemPrompt,
      brainstormPrompt,
      storyPrompt,
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
          maxTokens: 300, // Reduced to encourage concise, conversational responses
          minTokens: 10,
          model,
          temperature: 0.9, // Balanced creativity
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
    storyPrompt: string,
    history: { role: string; content: string }[],
    isInitialOrEmpty: boolean,
  ): any[] {
    const systemMsg = `${systemPrompt}\n\n[BRAINSTORMING MODE]\n${brainstormPrompt}`;

    const messages: any[] = [{ role: "system", content: systemMsg }];

    if (storyPrompt) {
      messages.push({
        role: "user",
        content: `Here is the current Story Prompt I am working on:\n${storyPrompt}\n\nLet's brainstorm based on this.`,
      });
      messages.push({
        role: "assistant",
        content:
          "Understood. I'm ready to help you develop this story. What specific aspect would you like to discuss?",
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
