import { StoryDataManager } from "./story-data-manager";
import { FieldID } from "../config/field-definitions";

export class BrainstormDataManager {
  constructor(private dataManager: StoryDataManager) {}

  public getMessages(): { role: string; content: string }[] {
    const data = this.dataManager.data;
    if (!data) return [];

    const brainstorm = data[FieldID.Brainstorm];
    if (!brainstorm.data) {
      brainstorm.data = { messages: [] };
    }
    // Migration check
    if (!brainstorm.data.messages && brainstorm.data.cards) {
      brainstorm.data = { messages: [] };
    }
    return brainstorm.data.messages || [];
  }

  public addMessage(role: string, content: string): void {
    const data = this.dataManager.data;
    if (!data) return;
    const brainstorm = data[FieldID.Brainstorm];

    if (!brainstorm.data) brainstorm.data = { messages: [] };
    if (!brainstorm.data.messages) brainstorm.data.messages = [];
    brainstorm.data.messages.push({ role, content });
  }

  public setMessages(messages: { role: string; content: string }[]): void {
    const data = this.dataManager.data;
    if (!data) return;
    const brainstorm = data[FieldID.Brainstorm];

    if (!brainstorm.data) brainstorm.data = { messages: [] };
    brainstorm.data.messages = messages;
  }

  public getConsolidated(): string {
    const messages = this.getMessages();
    if (messages.length === 0) return "";

    return messages
      .map((msg) => {
        const role = msg.role === "user" ? "User" : "Assistant";
        return `${role}: ${msg.content}`;
      })
      .join("\n\n");
  }
}
