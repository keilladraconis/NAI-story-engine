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
  fieldType?:
    | "prompt"
    | "brainstorm"
    | "worldSnapshot"
    | "dulfs"
    | "attg"
    | "style";
  generationInstruction?: string;
  listGenerationInstruction?: string;
  exampleFormat?: string;
  filters?: ("scrubBrackets" | "scrubMarkdown" | "normalizeQuotes")[];
  hidden?: boolean;
  parsingRegex?: RegExp;
}

export const FIELD_CONFIGS: FieldConfig[] = [
  {
    id: FieldID.StoryPrompt,
    label: "Story Prompt",
    description: "The initial creative spark for your story",
    placeholder: "Once upon a time in a world where...",
    icon: "bookOpen",
    fieldType: "prompt",
    generationInstruction:
      "Synthesize the brainstorming session into a high-level thematic starting point, including protagonist, key themes, and genre.",
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
    id: FieldID.UniverseSystems,
    label: "Universe Systems",
    description: "Rules, magic, technology, and world mechanics",
    placeholder: "How this world works - magic, physics, etc...",
    icon: "settings" as IconId,
    layout: "list",
    fieldType: "dulfs",
    generationInstruction:
      "Describe the key universe system, magic rule, or technological principle concisely.",
    exampleFormat:
      "System Name: Description of mechanic or rule. Example: Aetheric Resonance: High-frequency crystals can levitate heavy objects when sung to at specific pitches",
    filters: ["scrubBrackets"],
    parsingRegex: /^([^:]+):\s*(.+)$/,
  },
  {
    id: FieldID.Factions,
    label: "Factions",
    description: "Groups, organizations, and their agendas",
    placeholder: "Factions, guilds, political parties...",
    icon: "users",
    layout: "list",
    fieldType: "dulfs",
    generationInstruction:
      "Describe the core ideology, goal, and internal structure of the faction or group.",
    exampleFormat:
      "Faction Name: Ideology, Goal, Structure. Example: The Iron Pact: Militaristic isolationism, To protect the borders from invaders, Strict hierarchy based on combat merit",
    filters: ["scrubBrackets"],
    parsingRegex: /^([^:]+):\s*(.+)$/,
  },
  {
    id: FieldID.DramatisPersonae,
    label: "Dramatis Personae",
    description: "Characters by name, age, description, tell",
    placeholder: "Character names, descriptions, motivations...",
    icon: "user",
    layout: "list",
    fieldType: "dulfs",
    listGenerationInstruction:
      "Start with the protagonist and expand outward to other key figures.",
    generationInstruction:
      "Focus on the core motivation and unique behavioral tell of the character.",
    exampleFormat:
      "Name (Gender, Age, Role): Core motivation, Unique behavioral tell. Example: Kael (Male, 34, Smuggler): To pay off his life debt, Rubs a coin when calculating odds",
    filters: ["scrubBrackets"],
    parsingRegex: /^([^:(]+)\s*\(([^,]+),\s*([^,]+),\s*([^)]+)\):\s*(.+)$/,
  },

  {
    id: FieldID.Locations,
    label: "Locations",
    description: "Places where the story takes place",
    placeholder: "Settings, landmarks, environments...",
    icon: "map-pin" as IconId,
    layout: "list",
    fieldType: "dulfs",
    generationInstruction:
      "Include atmospheric anchors, sensory details, and inherent tensions of the location.",
    exampleFormat:
      "Location Name: Atmosphere, Sensory details, Tensions. Example: The Sunken Market: Claustrophobic and damp, Smell of salt and rotting wood, Constant fear of structural collapse",
    filters: ["scrubBrackets"],
    parsingRegex: /^([^:]+):\s*(.+)$/,
  },
  {
    id: FieldID.SituationalDynamics,
    label: "Situational Dynamics",
    description: "Current conflicts, tensions, and events",
    placeholder: "Active conflicts, pending events...",
    icon: "activity",
    layout: "list",
    fieldType: "dulfs",
    generationInstruction:
      "Describe a current conflict, pending event, or tension that involve multiple characters with no suggested resolution.",
    exampleFormat:
      "Dynamic Name: Description of the conflict or event. Example: The Succession Crisis: Three heirs vying for the throne after the Emperor's sudden death",
    filters: ["scrubBrackets"],
    parsingRegex: /^([^:]+):\s*(.+)$/,
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
