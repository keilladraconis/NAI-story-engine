import {
  FieldID,
  FIELD_CONFIGS,
  isDulfsField,
  isTextField,
} from "../config/field-definitions";

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

  // Global Settings
  setting: string;

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

  // Text Field Lorebook Integration
  textFieldEntryIds: Record<string, string>; // FieldID -> EntryID
  textFieldEnabled: Record<string, boolean>; // FieldID -> boolean

  // Generator Sync
  attgEnabled: boolean;
  styleEnabled: boolean;
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
    if (!data) {
      api.v1.log("Attempted to set null/undefined story data. Initializing default.");
      this.currentStory = this.createDefaultData();
    } else {
      this.currentStory = this.validateAndMigrate(data);
    }
    this.notifyListeners();
  }

  private validateAndMigrate(data: StoryData): StoryData {
    if (!data) return this.createDefaultData();
    
    // Ensure basic objects exist
    data.dulfsCategoryIds = data.dulfsCategoryIds || {};
    data.dulfsEntryIds = data.dulfsEntryIds || {};
    data.dulfsEnabled = data.dulfsEnabled || {};
    data.textFieldEntryIds = data.textFieldEntryIds || {};
    data.textFieldEnabled = data.textFieldEnabled || {};
    
    data.setting = data.setting || "Original";
    data.attgEnabled = data.attgEnabled || false;
    data.styleEnabled = data.styleEnabled || false;

    // Ensure all fields are initialized
    for (const config of FIELD_CONFIGS) {
      const id = config.id;
      if (config.layout === "list") {
        if (isDulfsField(id)) {
          data[id] = data[id] || [];
        }
      } else {
        if (isTextField(id) && !data[id]) {
          data[id] = {
            id: id,
            type: config.fieldType || "prompt",
            content: "",
            linkedEntities: [],
          };
          if (id === FieldID.Brainstorm) {
            data[id].data = { messages: [] };
          }
        }
      }
    }

    return data;
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
    if (isTextField(id)) {
      return this.currentStory[id];
    }
    return undefined;
  }

  public setStoryField(id: string, field: StoryField): void {
    if (!this.currentStory) return;
    if (isTextField(id)) {
      this.currentStory[id] = field;
    }
  }

  public getDulfsList(id: string): DULFSField[] {
    if (!this.currentStory) return [];
    if (isDulfsField(id)) {
      return this.currentStory[id];
    }
    return [];
  }

  public setDulfsList(id: string, list: DULFSField[]): void {
    if (!this.currentStory) return;
    if (isDulfsField(id)) {
      this.currentStory[id] = list;
    }
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
      setting: "Original",

      // Lorebook
      dulfsCategoryIds: {},
      dulfsEntryIds: {},
      dulfsEnabled: {},
      
      textFieldEntryIds: {},
      textFieldEnabled: {},

      // Sync
      attgEnabled: false,
      styleEnabled: false,
    };

    // Initialize all fields from configurations to ensure they are never undefined
    for (const config of FIELD_CONFIGS) {
      const id = config.id;
      if (config.layout === "list") {
        data[id] = [];
      } else {
        const field: StoryField = {
          id: id,
          type: config.fieldType || "prompt",
          content: "",
          linkedEntities: [],
        };

        if (id === FieldID.Brainstorm) {
          field.data = { messages: [] };
        }

        data[id] = field;
      }
    }

    return data as StoryData;
  }
}
