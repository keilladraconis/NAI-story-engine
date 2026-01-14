import { StoryManager } from "./story-manager";

export class BrainstormService {
  private storyManager: StoryManager;

  constructor(storyManager: StoryManager) {
    this.storyManager = storyManager;
  }

  public async addUserMessage(content: string): Promise<void> {
    if (content.trim()) {
      this.storyManager.addBrainstormMessage("user", content);
      await this.storyManager.saveStoryData();
    }
  }

  public async editMessage(index: number, newContent: string): Promise<void> {
    const history = this.storyManager.getBrainstormMessages();
    if (index >= 0 && index < history.length) {
      history[index].content = newContent;
      this.storyManager.setBrainstormMessages(history);
            await this.storyManager.saveStoryData();

    }
  }

  public async deleteMessage(index: number): Promise<void> {
    const history = this.storyManager.getBrainstormMessages();
    if (index >= 0 && index < history.length) {
      history.splice(index, 1);
      this.storyManager.setBrainstormMessages(history);
            await this.storyManager.saveStoryData();

    }
  }

  public async prepareRetry(index: number): Promise<void> {
    const history = this.storyManager.getBrainstormMessages();
    if (index < 0 || index >= history.length) return;

    const msg = history[index];
    let newHistory: typeof history;

    if (msg.role === "assistant") {
      // Truncate to index-1 (removing this assistant message and any following)
      newHistory = history.slice(0, index);
    } else {
      // User message: Truncate to index (keeping this message) and removing subsequent
      newHistory = history.slice(0, index + 1);
    }

    this.storyManager.setBrainstormMessages(newHistory);
          await this.storyManager.saveStoryData();

  }

  public async clearHistory(): Promise<void> {
    this.storyManager.setBrainstormMessages([]);
          await this.storyManager.saveStoryData();

  }
}