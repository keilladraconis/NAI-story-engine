import { FieldHistory } from "./field-history";
import { FieldID } from "../config/field-definitions";

interface StoryData {
  id: string;
  version: string;

  // Workflow stages
  [FieldID.StoryPrompt]: StoryField;
  [FieldID.Brainstorm]: StoryField;
  [FieldID.WorldSnapshot]: StoryField;

  // DULFS components
  [FieldID.DramatisPersonae]: DULFSField[];
  [FieldID.UniverseSystems]: DULFSField[];
  [FieldID.Locations]: DULFSField[];
  [FieldID.Factions]: DULFSField[];
  [FieldID.SituationalDynamics]: DULFSField[];
  // Dulfs placeholder
  [FieldID.Dulfs]?: any;
  [FieldID.StoryLorebooks]?: any;

  // History and metadata
  lastModified: Date;
}

interface StoryField {
  id: string;
  type: "prompt" | "brainstorm" | "worldSnapshot" | "dulfs";
  content: string;
  version: number;
  history: FieldHistory[];
  linkedEntities: string[]; // References to DULFS entities
  data?: any; // Generic container for field-specific structured data (e.g. Brainstorm cards)
}

interface DULFSField {
  id: string;
  category:
    | "dramatisPersonae"
    | "universeSystems"
    | "locations"
    | "factions"
    | "situationalDynamics";
  name: string;
  description: string;
  attributes: Record<string, any>;
  linkedLorebooks: string[];
}

export class StoryManager {
  private static readonly KEYS = {
    STORY_DATA: "kse-story-data",
  };

  private currentStory?: StoryData;
  private listeners: (() => void)[] = [];

  constructor() {
    this.initializeStory();
  }

  async initializeStory(): Promise<void> {
    const savedData = await api.v1.storyStorage.get(
      StoryManager.KEYS.STORY_DATA,
    );

    if (savedData) {
      this.currentStory = savedData;
    } else {
      this.currentStory = this.createDefaultStoryData();
      await this.saveStoryData();
    }
    this.notifyListeners();
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notifyListeners(): void {
    this.listeners.forEach((listener) => listener());
  }

  public getFieldContent(fieldId: string): string {
    if (!this.currentStory) return "";
    
    // Cast to any to allow dynamic access by string ID
    const field = (this.currentStory as any)[fieldId];
    
    // If it's a StoryField, return content
    if (field && typeof field === "object" && "content" in field) {
        return field.content;
    }

    return "";
  }

  public async setFieldContent(
    fieldId: string,
    content: string,
    save: boolean = false,
  ): Promise<void> {
    if (!this.currentStory) return;

    const storyAny = this.currentStory as any;
    const field = storyAny[fieldId];
    let changed = false;

    if (field && typeof field === "object" && "content" in field) {
        if (field.content !== content) {
            field.content = content;
            changed = true;
        }
    }

    if (changed && save) {
      this.currentStory.lastModified = new Date();
      await this.saveStoryData();
    }
  }

  public async commit(): Promise<void> {
    if (!this.currentStory) return;

    let changed = false;
    
    // Iterate over known text fields
    const textFields = [
        this.currentStory[FieldID.StoryPrompt],
        this.currentStory[FieldID.Brainstorm],
        this.currentStory[FieldID.WorldSnapshot],
    ];

    for (const field of textFields) {
      const lastEntry =
        field.history.length > 0
          ? field.history[field.history.length - 1]
          : null;

      // Only commit if content is different from last commit
      if (
        (!lastEntry && field.content.trim() !== "") ||
        (lastEntry && lastEntry.content !== field.content)
      ) {
        const newVersion = field.version + 1;
        const historyEntry: FieldHistory = {
          id: api.v1.uuid(),
          timestamp: new Date(),
          version: newVersion,
          content: field.content,
          source: "commit",
        };

        field.history.push(historyEntry);
        field.version = newVersion;
        changed = true;
      }
    }

    if (changed) {
      this.currentStory.lastModified = new Date();
      await this.saveStoryData(true); // Save and notify
      api.v1.log("Story state committed to history.");
    } else {
      api.v1.log("No changes to commit.");
    }
  }

  private createDefaultStoryData(): StoryData {
    return {
      id: "current-story",
      version: "0.1.0",

      // Primary components
      [FieldID.StoryPrompt]: {
        id: FieldID.StoryPrompt,
        type: "prompt",
        content: "",
        version: 0,
        history: [],
        linkedEntities: [],
      },
      [FieldID.Brainstorm]: {
        id: FieldID.Brainstorm,
        type: "brainstorm",
        content: "",
        version: 0,
        history: [],
        linkedEntities: [],
        data: { messages: [] }, // Initialize with empty chat history
      },
      [FieldID.WorldSnapshot]: {
        id: FieldID.WorldSnapshot,
        type: "worldSnapshot",
        content: "",
        version: 0,
        history: [],
        linkedEntities: [],
      },

      // DULFS components (start empty)
      [FieldID.DramatisPersonae]: [],
      [FieldID.UniverseSystems]: [],
      [FieldID.Locations]: [],
      [FieldID.Factions]: [],
      [FieldID.SituationalDynamics]: [],

      lastModified: new Date(),
    };
  }

  public getBrainstormMessages(): { role: string; content: string }[] {
    if (!this.currentStory) return [];
    
    const brainstorm = this.currentStory[FieldID.Brainstorm];
    
    // Ensure data object exists
    if (!brainstorm.data) {
      brainstorm.data = { messages: [] };
    }
    // Migration check: if 'cards' exists but 'messages' doesn't, reset to empty messages
    if (!brainstorm.data.messages && brainstorm.data.cards) {
       brainstorm.data = { messages: [] };
    }
    return brainstorm.data.messages || [];
  }

  public addBrainstormMessage(role: string, content: string): void {
    if (!this.currentStory) return;
    const brainstorm = this.currentStory[FieldID.Brainstorm];

    if (!brainstorm.data) {
      brainstorm.data = { messages: [] };
    }
    if (!brainstorm.data.messages) {
      brainstorm.data.messages = [];
    }
    brainstorm.data.messages.push({ role, content });
  }

  public setBrainstormMessages(messages: { role: string; content: string }[]): void {
    if (!this.currentStory) return;
    const brainstorm = this.currentStory[FieldID.Brainstorm];
    
    if (!brainstorm.data) {
      brainstorm.data = { messages: [] };
    }
    brainstorm.data.messages = messages;
  }

  public getConsolidatedBrainstorm(): string {
    const messages = this.getBrainstormMessages();
    if (messages.length === 0) return "";

    return messages
      .map((msg) => {
        const role = msg.role === "user" ? "User" : "Assistant";
        return `${role}: ${msg.content}`;
      })
      .join("\n\n");
  }

  public async saveStoryData(notify: boolean = true): Promise<void> {
    await api.v1.storyStorage.set(
      StoryManager.KEYS.STORY_DATA,
      this.currentStory,
    );
    if (notify) {
      this.notifyListeners();
    }
  }
}
