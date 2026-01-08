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

export type DulfsFieldID =
  | FieldID.DramatisPersonae
  | FieldID.UniverseSystems
  | FieldID.Locations
  | FieldID.Factions
  | FieldID.SituationalDynamics;

export type TextFieldID =
  | FieldID.StoryPrompt
  | FieldID.Brainstorm
  | FieldID.WorldSnapshot
  | FieldID.ATTG
  | FieldID.Style;

export function isDulfsField(id: string): id is DulfsFieldID {
  return [
    FieldID.DramatisPersonae,
    FieldID.UniverseSystems,
    FieldID.Locations,
    FieldID.Factions,
    FieldID.SituationalDynamics,
  ].includes(id as FieldID);
}

export function isTextField(id: string): id is TextFieldID {
  return [
    FieldID.StoryPrompt,
    FieldID.Brainstorm,
    FieldID.WorldSnapshot,
    FieldID.ATTG,
    FieldID.Style,
  ].includes(id as FieldID);
}

export interface FieldConfig {
  id: FieldID;
  label: string;
  description: string;
  placeholder: string;
  icon: IconId;
  linkedEntities?: string[];
  layout?: "default" | "list";
  fieldType?: "prompt" | "brainstorm" | "worldSnapshot" | "dulfs" | "attg" | "style";
  generationInstruction?: string;
  exampleFormat?: string;
  filters?: ("scrubBrackets" | "scrubMarkdown" | "normalizeQuotes")[];
  hidden?: boolean;
}

export const FIELD_CONFIGS: FieldConfig[] = [
  {
    id: FieldID.StoryPrompt,
    label: "Story Prompt",
    description: "The initial creative spark for your story",
    placeholder: "Once upon a time in a world where...",
    icon: "bookOpen",
    fieldType: "prompt",
    generationInstruction: "Synthesize the brainstorming session into a high-level thematic starting point, including protagonist, key themes, and genre.",
    filters: ["scrubBrackets"],
  },
  {
    id: FieldID.Brainstorm,
    label: "Brainstorm",
    description: "Brainstorming chat history and consolidated material",
    placeholder: "",
    icon: "cloud-lightning" as IconId,
    hidden: true,
    fieldType: "brainstorm",
  },
  {
    id: FieldID.WorldSnapshot,
    label: "Dynamic World Snapshot",
    description: "A snapshot of the world full of dynamic potential",
    placeholder: "The state of the world, its drivers, and tensions...",
    icon: "package",
    fieldType: "worldSnapshot",
    filters: ["scrubBrackets"],
  },
  {
    id: FieldID.DramatisPersonae,
    label: "Dramatis Personae",
    description: "Characters by name, age, description, tell",
    placeholder: "Character names, descriptions, motivations...",
    icon: "user",
    layout: "list",
    fieldType: "dulfs",
    generationInstruction: "Generate a list of interesting characters for this story. Focus on their core motivations and unique behavioral tells.",
    exampleFormat: "Format each line exactly as: [First and Last Name] ([gender], [age], [occupation]): [core motivation], [behavioral tell]",
    filters: ["scrubBrackets"],
  },
  {
    id: FieldID.UniverseSystems,
    label: "Universe Systems",
    description: "Rules, magic, technology, and world mechanics",
    placeholder: "How this world works - magic, physics, etc...",
    icon: "settings" as IconId,
    layout: "list",
    fieldType: "dulfs",
    generationInstruction: "Generate a list of key universe systems, magic rules, or technological principles. Describe the mechanic or rule concisely.",
    exampleFormat: "Format each line as: [System Name]: [Description of mechanic or rule]",
    filters: ["scrubBrackets"],
  },
  {
    id: FieldID.Locations,
    label: "Locations",
    description: "Places where the story takes place",
    placeholder: "Settings, landmarks, environments...",
    icon: "map-pin" as IconId,
    layout: "list",
    fieldType: "dulfs",
    generationInstruction: "Generate a list of significant locations. Include atmospheric anchors, sensory details, and inherent tensions.",
    exampleFormat: "Format each line as: [Location Name]: [atmospheric anchors], [sensory details], [inherent tensions or key functions]",
    filters: ["scrubBrackets"],
  },
  {
    id: FieldID.Factions,
    label: "Factions",
    description: "Groups, organizations, and their agendas",
    placeholder: "Factions, guilds, political parties...",
    icon: "users",
    layout: "list",
    fieldType: "dulfs",
    generationInstruction: "Generate a list of major factions, guilds, or political groups. Describe their core ideology, goal, and internal structure.",
    exampleFormat: "Format each line as: [Faction Name]: [description of ideology, goal, structure]",
    filters: ["scrubBrackets"],
  },
  {
    id: FieldID.SituationalDynamics,
    label: "Situational Dynamics",
    description: "Current conflicts, tensions, and events",
    placeholder: "Active conflicts, pending events...",
    icon: "activity",
    layout: "list",
    fieldType: "dulfs",
    generationInstruction: "Generate a list of current conflicts, pending events, or tensions that involve multiple characters with no suggested resolution.",
    exampleFormat: "Format each line as: [Dynamic Name]: [a state of being or point of friction...]",
    filters: ["scrubBrackets"],
  },
  {
    id: FieldID.ATTG,
    label: "ATTG",
    description: "Author, Title, Tags, Genre block",
    placeholder: "[ Author: ...; Tags: ...; Title: ...; Genre: ... ]",
    icon: "tag",
    fieldType: "attg",
  },
  {
    id: FieldID.Style,
    label: "Style Guidelines",
    description: "Writing style instructions for the AI",
    placeholder: "[ Style: ... ]",
    icon: "feather",
    fieldType: "style",
  },
];

export const LIST_FIELD_IDS = FIELD_CONFIGS.filter(
  (c) => c.layout === "list",
).map((c) => c.id);

export const TEXT_FIELD_IDS = FIELD_CONFIGS.filter(
  (c) => c.layout !== "list",
).map((c) => c.id);
