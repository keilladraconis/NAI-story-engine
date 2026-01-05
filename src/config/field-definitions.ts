export enum FieldID {
  StoryPrompt = "storyPrompt",
  Brainstorm = "brainstorm",
  WorldSnapshot = "worldSnapshot",
  Dulfs = "dulfs",
  DramatisPersonae = "dramatisPersonae",
  UniverseSystems = "universeSystems",
  Locations = "locations",
  StoryLorebooks = "storyLorebooks",
  Factions = "factions",
  SituationalDynamics = "situationalDynamics"
}

export interface FieldConfig {
  id: FieldID;
  label: string;
  description: string;
  placeholder: string;
  icon: IconId;
  linkedEntities?: string[];
  layout?: "default" | "inline-wand";
}

export const FIELD_CONFIGS: FieldConfig[] = [
  {
    id: FieldID.StoryPrompt,
    label: "Story Prompt",
    description: "The initial creative spark for your story",
    placeholder: "Once upon a time in a world where...",
    icon: "bookOpen",
  },
  {
    id: FieldID.WorldSnapshot,
    label: "Dynamic World Snapshot",
    description: "A snapshot of the world full of dynamic potential",
    placeholder: "The state of the world, its drivers, and tensions...",
    icon: "package",
    layout: "inline-wand",
  },
  {
    id: FieldID.Dulfs,
    label: "DULFS",
    description:
      "Dramatis Personae, Universe Systems, Locations, Factions, Situational Dynamics",
    placeholder: "Characters, world, setting, and story elements...",
    icon: "users",
  },
  {
    id: FieldID.DramatisPersonae,
    label: "Dramatis Personae",
    description: "Main characters and their relationships",
    placeholder: "Character names, descriptions, motivations...",
    icon: "user",
  },
  {
    id: FieldID.UniverseSystems,
    label: "Universe Systems",
    description: "Rules, magic, technology, and world mechanics",
    placeholder: "How this world works - magic, physics, etc...",
    icon: "settings" as IconId,
  },
  {
    id: FieldID.Locations,
    label: "Locations",
    description: "Places where the story takes place",
    placeholder: "Settings, landmarks, environments...",
    icon: "map-pin" as IconId,
  },
  {
    id: FieldID.StoryLorebooks,
    label: "Story Lorebooks",
    description: "Integrated lorebooks for story elements",
    placeholder: "Organized lore for story-specific elements...",
    icon: "book",
  },
];
