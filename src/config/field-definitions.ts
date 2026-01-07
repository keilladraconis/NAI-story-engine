export enum FieldID {
  StoryPrompt = "storyPrompt",
  Brainstorm = "brainstorm",
  WorldSnapshot = "worldSnapshot",
  DramatisPersonae = "dramatisPersonae",
  UniverseSystems = "universeSystems",
  Locations = "locations",
  Factions = "factions",
  SituationalDynamics = "situationalDynamics",
  ATTG = "attg",
  Style = "style",
}

export interface FieldConfig {
  id: FieldID;
  label: string;
  description: string;
  placeholder: string;
  icon: IconId;
  linkedEntities?: string[];
  layout?: "default" | "inline-wand" | "list" | "generator";
  generationInstruction?: string;
  exampleFormat?: string;
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
    id: FieldID.DramatisPersonae,
    label: "Dramatis Personae",
    description: "Characters by name, age, description, tell",
    placeholder: "Character names, descriptions, motivations...",
    icon: "user",
    layout: "list",
    generationInstruction: "Generate a list of interesting characters for this story. Focus on their core motivations and unique behavioral tells.",
    exampleFormat: "Format each line exactly as: [First and Last Name] ([gender], [age], [occupation]): [core motivation], [behavioral tell]",
  },
  {
    id: FieldID.UniverseSystems,
    label: "Universe Systems",
    description: "Rules, magic, technology, and world mechanics",
    placeholder: "How this world works - magic, physics, etc...",
    icon: "settings" as IconId,
    layout: "list",
    generationInstruction: "Generate a list of key universe systems, magic rules, or technological principles. Describe the mechanic or rule concisely.",
    exampleFormat: "Format each line as: [System Name]: [Description of mechanic or rule]",
  },
  {
    id: FieldID.Locations,
    label: "Locations",
    description: "Places where the story takes place",
    placeholder: "Settings, landmarks, environments...",
    icon: "map-pin" as IconId,
    layout: "list",
    generationInstruction: "Generate a list of significant locations. Include atmospheric anchors, sensory details, and inherent tensions.",
    exampleFormat: "Format each line as: [Location Name]: [atmospheric anchors], [sensory details], [inherent tensions or key functions]",
  },
  {
    id: FieldID.Factions,
    label: "Factions",
    description: "Groups, organizations, and their agendas",
    placeholder: "Factions, guilds, political parties...",
    icon: "users",
    layout: "list",
    generationInstruction: "Generate a list of major factions, guilds, or political groups. Describe their core ideology, goal, and internal structure.",
    exampleFormat: "Format each line as: [Faction Name]: [description of ideology, goal, structure]",
  },
  {
    id: FieldID.SituationalDynamics,
    label: "Situational Dynamics",
    description: "Current conflicts, tensions, and events",
    placeholder: "Active conflicts, pending events...",
    icon: "activity",
    layout: "list",
    generationInstruction: "Generate a list of current conflicts, pending events, or tensions that involve multiple characters with no suggested resolution.",
    exampleFormat: "Format each line as: [Dynamic Name]: [a state of being or point of friction...]",
  },
  {
    id: FieldID.ATTG,
    label: "ATTG",
    description: "Author, Title, Tags, Genre block",
    placeholder: "[ Author: ...; Tags: ...; Title: ...; Genre: ... ]",
    icon: "tag",
    layout: "generator",
  },
  {
    id: FieldID.Style,
    label: "Style Guidelines",
    description: "Writing style instructions for the AI",
    placeholder: "[ Style: ... ]",
    icon: "feather",
    layout: "generator",
  },
];
