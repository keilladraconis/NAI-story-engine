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
  dulfsSummaries: Record<string, string>; // FieldID -> Summary Text

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

  public get data(): StoryData | undefined {
    return this.currentStory;
  }

  public setData(data: StoryData): void {
    if (!data) {
      api.v1.log("Attempted to set null/undefined story data. Initializing default.");
      this.currentStory = this.createDefaultData();
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
      dulfsSummaries: {},
      
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
