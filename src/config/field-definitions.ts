export interface FieldConfig {
  id: string;
  label: string;
  description: string;
  placeholder: string;
  icon: IconId;
  linkedEntities?: string[];
}

export const FIELD_CONFIGS: FieldConfig[] = [
  {
    id: "storyPrompt",
    label: "Story Prompt",
    description: "The initial creative spark for your story",
    placeholder: "Once upon a time in a world where...",
    icon: "bookOpen",
  },
  {
    id: "brainstorm",
    label: "Brainstorm",
    description: "Creative exploration and ideation",
    placeholder: "Let me explore the possibilities of this world...",
    icon: "cloud-lightning",
  },
  {
    id: "worldSnapshot",
    label: "Dynamic World Snapshot",
    description: "A snapshot of the world full of dynamic potential",
    placeholder: "The state of the world, its drivers, and tensions...",
    icon: "package",
  },
  {
    id: "dulfs",
    label: "DULFS",
    description:
      "Dramatis Personae, Universe Systems, Locations, Factions, Situational Dynamics",
    placeholder: "Characters, world, setting, and story elements...",
    icon: "users",
  },
  {
    id: "dramatisPersonae",
    label: "Dramatis Personae",
    description: "Main characters and their relationships",
    placeholder: "Character names, descriptions, motivations...",
    icon: "user",
  },
  {
    id: "universeSystems",
    label: "Universe Systems",
    description: "Rules, magic, technology, and world mechanics",
    placeholder: "How this world works - magic, physics, etc...",
    icon: "settings" as IconId,
  },
  {
    id: "locations",
    label: "Locations",
    description: "Places where the story takes place",
    placeholder: "Settings, landmarks, environments...",
    icon: "map-pin" as IconId,
  },
  {
    id: "storyLorebooks",
    label: "Story Lorebooks",
    description: "Integrated lorebooks for story elements",
    placeholder: "Organized lore for story-specific elements...",
    icon: "book",
  },
];
