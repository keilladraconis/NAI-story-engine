import { FieldHistory } from "./field-history";

interface StoryData {
  id: string;
  version: string;

  // Workflow stages
  storyPrompt: StoryField;
  brainstorm: StoryField;
  worldSnapshot: StoryField;

  // DULFS components
  dramatisPersonae: DULFSField[];
  universeSystems: DULFSField[];
  locations: DULFSField[];
  factions: DULFSField[];
  situationalDynamics: DULFSField[];

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

    // Check specific fields first
    if (fieldId === "storyPrompt") return this.currentStory.storyPrompt.content;
    if (fieldId === "brainstorm") return this.currentStory.brainstorm.content;
    if (fieldId === "worldSnapshot")
      return this.currentStory.worldSnapshot.content;

    // Check if it's a DULFS field (not fully implemented in data structure yet, but provided for consistency)
    // For now, return empty string or implement logic if DULFS structure allows
    return "";
  }

  public async setFieldContent(
    fieldId: string,
    content: string,
    save: boolean = false,
  ): Promise<void> {
    if (!this.currentStory) return;

    let changed = false;
    if (fieldId === "storyPrompt") {
      if (this.currentStory.storyPrompt.content !== content) {
        this.currentStory.storyPrompt.content = content;
        changed = true;
      }
    } else if (fieldId === "brainstorm") {
      if (this.currentStory.brainstorm.content !== content) {
        this.currentStory.brainstorm.content = content;
        changed = true;
      }
    } else if (fieldId === "worldSnapshot") {
      if (this.currentStory.worldSnapshot.content !== content) {
        this.currentStory.worldSnapshot.content = content;
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
    const fields: StoryField[] = [
      this.currentStory.storyPrompt,
      this.currentStory.brainstorm,
      this.currentStory.worldSnapshot,
    ];

    for (const field of fields) {
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
      storyPrompt: {
        id: "storyPrompt",
        type: "prompt",
        content: "",
        version: 0,
        history: [],
        linkedEntities: [],
      },
      brainstorm: {
        id: "brainstorm",
        type: "brainstorm",
        content: "",
        version: 0,
        history: [],
        linkedEntities: [],
      },
      worldSnapshot: {
        id: "worldSnapshot",
        type: "worldSnapshot",
        content: "",
        version: 0,
        history: [],
        linkedEntities: [],
      },

      // DULFS components (start empty)
      dramatisPersonae: [],
      universeSystems: [],
      locations: [],
      factions: [],
      situationalDynamics: [],

      lastModified: new Date(),
    };
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
