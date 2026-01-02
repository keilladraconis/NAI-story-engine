interface StoryData {
  id: string;
  version: string;

  // Workflow stages
  storyPrompt: StoryField;
  brainstorm: StoryField;
  synopsis: StoryField;

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
  type: "prompt" | "brainstorm" | "synopsis" | "dulfs";
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

class StoryHistory {}

class FieldHistory {}

export class StoryManager {
  private static readonly KEYS = {
    STORY_DATA: "kse-story-data",
  };

  private currentStory?: StoryData;
  private history?: StoryHistory;

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
    this.history = new StoryHistory();
  }

  private createDefaultStoryData(): StoryData {
    return {
      id: "current-story",
      version: "0.1.0",

      // Workflow stages
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
      synopsis: {
        id: "synopsis",
        type: "synopsis",
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

  private async saveStoryData(): Promise<void> {
    await api.v1.storyStorage.set(
      StoryManager.KEYS.STORY_DATA,
      this.currentStory,
    );
  }
}
