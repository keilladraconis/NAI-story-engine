import { StoryData } from "./story-data-manager";
import { Store, Action } from "./store";
import { FieldID } from "../config/field-definitions";

export class BrainstormDataManager {
  constructor(
    private store: Store<StoryData>,
    private dispatch: (action: Action<StoryData>) => void,
  ) {}

  public getMessages(): { role: string; content: string }[] {
    const data = this.store.get();

    const brainstorm = data[FieldID.Brainstorm];
    if (!brainstorm) return []; // Should exist by initialization

    // Migration check (read-only)
    if (brainstorm.data && !brainstorm.data.messages && brainstorm.data.cards) {
       return []; // Or should we fix it? The old code fixed it by mutating. 
       // We can just return empty and let next update fix it or fix it lazily.
       // For safety, let's treat it as empty.
    }
    
    return brainstorm.data?.messages || [];
  }

  public addMessage(role: string, content: string): void {
    this.dispatch((store) =>
      store.update((s) => {
        const brainstorm = s[FieldID.Brainstorm];
        const messages = [
          ...(brainstorm.data?.messages || []),
          { role, content },
        ];
        s[FieldID.Brainstorm] = {
          ...brainstorm,
          data: { ...brainstorm.data, messages },
        };
      }),
    );
  }

  public setMessages(messages: { role: string; content: string }[]): void {
    this.dispatch((store) =>
      store.update((s) => {
        const brainstorm = s[FieldID.Brainstorm];
        s[FieldID.Brainstorm] = {
          ...brainstorm,
          data: { ...brainstorm.data, messages },
        };
      }),
    );
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