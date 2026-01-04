import { StoryManager } from "./story-manager";
import { BrainstormCard, BrainstormManager } from "./brainstorm-cards";
import { hyperGenerate } from "../hyper-generator";

export class BrainstormService {
  private storyManager: StoryManager;

  constructor(storyManager: StoryManager) {
    this.storyManager = storyManager;
  }

  public async generateBurst(
    cards: BrainstormCard[],
    userDirective: string,
    onDelta: (text: string) => void
  ): Promise<BrainstormCard[]> {
    const storyPrompt = this.storyManager.getFieldContent("storyPrompt");
    const systemPrompt = (await api.v1.config.get("system_prompt")) || "";
    
    const messages = this.buildPrompt(systemPrompt, storyPrompt, cards, userDirective);

    // We'll capture the full text to parse at the end, 
    let fullText = "";

    const cancellationSignal = await api.v1.createCancellationSignal();

    await hyperGenerate(
      messages,
      {
        maxTokens: 500, // Slightly more for better thoughts
        minTokens: 50,
        temperature: 1.1, // Adjusted for creative but coherent bursts
      },
      (text) => {
        fullText += text;
        onDelta(fullText);
      },
      "background",
      cancellationSignal
    );

    // Parse the full text into cards
    return BrainstormManager.parseOutputToCards(fullText, cards.length);
  }

  private buildPrompt(systemPrompt: string, storyPrompt: string, cards: BrainstormCard[], directive: string): any[] {
    const accepted = cards.filter(c => c.status === "accepted");
    const rejected = cards.filter(c => c.status === "rejected");

    // Take the last ~10 accepted cards for context to keep it relevant
    const recentAccepted = accepted.slice(-10);
    
    // Take the last ~5 rejected for negative constraints
    const recentRejected = rejected.slice(-5);

    let systemMsg = `${systemPrompt}\n\n[BRAINSTORMING MODE]
Your goal is to generate 3-5 distinct, high-impact worldbuilding ideas based on the user's Story Prompt.

Output Format:
Each idea must be on a new line.
[Category] The idea content...

Categories can be anything (e.g., [Theme], [Setting], [Character], [Conflict], [Magic]).
Keep ideas concise (1-2 sentences).
`;

    if (recentRejected.length > 0) {
      systemMsg += `
Avoid ideas similar to these rejected ones:
`;
      recentRejected.forEach(c => systemMsg += `- ${c.content}\n`);
    }

    const messages = [
      { role: "system", content: systemMsg },
      { role: "user", content: `Story Prompt: ${storyPrompt}` }
    ];

    if (recentAccepted.length > 0) {
       let historyMsg = "Here are some ideas I've already accepted:\n";
       recentAccepted.forEach(c => historyMsg += `[${c.tag}] ${c.content}\n`);
       messages.push({ role: "assistant", content: historyMsg });
    }

    let nextUserMsg = "Generate 3-5 NEW ideas.";
    if (directive) {
      nextUserMsg += ` Focus on: ${directive}`;
    }

    messages.push({ role: "user", content: nextUserMsg });

    return messages;
  }
}
