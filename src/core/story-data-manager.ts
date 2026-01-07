import { FieldID, FIELD_CONFIGS } from "../config/field-definitions";

export interface StoryField {
  id: string;
  type: "prompt" | "brainstorm" | "worldSnapshot" | "dulfs" | "attg" | "style";
  content: string;
  linkedEntities: string[]; // References to DULFS entities
  data?: any; // Generic container for field-specific structured data (e.g. Brainstorm cards)
}

export interface DULFSField {
  id: string;
  category:
    | "dramatisPersonae"
    | "universeSystems"
    | "locations"
    | "factions"
    | "situationalDynamics";
  content: string;
  name: string;
  description: string;
  attributes: Record<string, any>;
  linkedLorebooks: string[];
  lorebookContent?: string;
}

export interface StoryData {
  id: string;
  version: string;

  // Workflow stages
  [FieldID.StoryPrompt]: StoryField;
  [FieldID.Brainstorm]: StoryField;
  [FieldID.WorldSnapshot]: StoryField;
  [FieldID.ATTG]: StoryField;
  [FieldID.Style]: StoryField;

  // DULFS components
  [FieldID.DramatisPersonae]: DULFSField[];
  [FieldID.UniverseSystems]: DULFSField[];
  [FieldID.Locations]: DULFSField[];
  [FieldID.Factions]: DULFSField[];
  [FieldID.SituationalDynamics]: DULFSField[];

  // Lorebook Integration
  dulfsCategoryIds: Record<string, string>; // FieldID -> CategoryID
  dulfsEntryIds: Record<string, string>; // FieldID -> EntryID
  dulfsEnabled: Record<string, boolean>; // FieldID -> boolean

  // Generator Sync
  attgEnabled: boolean;
  styleEnabled: boolean;

  // History and metadata
  lastModified: Date;
}

export class StoryDataManager {
  public static readonly KEYS = {
    STORY_DATA: "kse-story-data",
  };

  private currentStory?: StoryData;
  private listeners: (() => void)[] = [];

  constructor() {}

  public get data(): StoryData | undefined {
    return this.currentStory;
  }

  public setData(data: StoryData): void {
    this.currentStory = data;
    this.notifyListeners();
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  public notifyListeners(): void {
    this.listeners.forEach((listener) => listener());
  }

  public getStoryField(id: string): StoryField | undefined {
    if (!this.currentStory) return undefined;
    const field = (this.currentStory as any)[id];
    if (field && typeof field === "object" && "content" in field) {
      return field as StoryField;
    }
    return undefined;
  }

  public getDulfsList(id: string): DULFSField[] {
    if (!this.currentStory) return [];
    const list = (this.currentStory as any)[id];
    if (Array.isArray(list)) {
      return list as DULFSField[];
    }
    return [];
  }

  public async save(): Promise<void> {
    if (!this.currentStory) return;
    await api.v1.storyStorage.set(
      StoryDataManager.KEYS.STORY_DATA,
      this.currentStory,
    );
  }

  public createDefaultData(): StoryData {
    const data: any = {
      id: "current-story",
      version: "0.1.0",

      // Lorebook
      dulfsCategoryIds: {},
      dulfsEntryIds: {},
      dulfsEnabled: {},

      // Sync
      attgEnabled: false,
      styleEnabled: false,

      lastModified: new Date(),
    };

    // Initialize fields from configurations
    for (const config of FIELD_CONFIGS) {
      if (config.layout === "list") {
        data[config.id] = [];
      } else {
        data[config.id] = {
          id: config.id,
          type: config.fieldType || "prompt",
          content: "",
          linkedEntities: [],
        };

        // Specialized initialization
        if (config.id === FieldID.Brainstorm) {
          data[config.id].data = { messages: [] };
        }
      }
    }

    return data as StoryData;
  }
}
