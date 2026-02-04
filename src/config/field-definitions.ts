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
  listExampleFormat?: string;
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
    description: "Rules, magic, technology, laws, and world mechanics",
    placeholder: "How this world works - magic, physics, laws...",
    icon: "settings" as IconId,
    layout: "list",
    fieldType: "dulfs",
    listGenerationInstruction:
      "List only system/mechanic names. Focus on fundamental world rules.",
    listExampleFormat:
      "- Aetheric Resonance\n- The Binding Laws\n- Chrono-Drift",
    generationInstruction:
      "Describe the key universe system, law, or technological principle, its mechanics/terms, and its broader impact on the world.",
    exampleFormat:
      "System Name: Description of mechanic, societal impact, and rules. Example: Aetheric Resonance: High-frequency crystals can levitate heavy objects when sung to at specific pitches. This system forms the backbone of the empire's sky-fleets but causes 'harmonic sickness' in long-term pilots.",
    filters: ["scrubBrackets"],
    parsingRegex: /^([^:]+):\s*([\s\S]+)$/,
  },
  {
    id: FieldID.Factions,
    label: "Factions",
    description: "Groups, organizations, and their agendas",
    placeholder: "Factions, guilds, political parties...",
    icon: "users",
    layout: "list",
    fieldType: "dulfs",
    listGenerationInstruction: "List only faction/organization names.",
    listExampleFormat: "- The Iron Pact\n- House Meridian\n- The Unbound",
    generationInstruction:
      "Describe the faction's core ideology, history, and its role in the world's power dynamics.",
    exampleFormat:
      "Faction Name: Goal, history, and public face vs. private reality. Example: The Iron Pact: A militaristic group dedicated to border protection. Publicly they are heroes, but privately they are hoarding ancient artifacts to trigger a pre-emptive strike against their rivals.",
    filters: ["scrubBrackets"],
    parsingRegex: /^([^:]+):\s*([\s\S]+)$/,
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
      "List only character names. Start with the protagonist, then supporting characters.",
    listExampleFormat: "- Kael\n- Elena\n- The Iron Warden",
    generationInstruction:
      "Focus on the core motivation and unique behavioral tell of the character.",
    exampleFormat:
      "Name (Gender, Age, Role): Core motivation, Unique behavioral tell. Example: Kael (Male, 34, Smuggler): To pay off his life debt, Rubs a coin when calculating odds",
    filters: ["scrubBrackets"],
    parsingRegex: /^([^:(]+)\s*\(([^,]+),\s*([^,]+),\s*([^)]+)\):\s*([\s\S]+)$/,
  },

  {
    id: FieldID.Locations,
    label: "Locations",
    description: "Places where the story takes place",
    placeholder: "Settings, landmarks, environments...",
    icon: "map-pin" as IconId,
    layout: "list",
    fieldType: "dulfs",
    listGenerationInstruction:
      "List only location names. Include places relevant to the story.",
    listExampleFormat:
      "- The Sunken Market\n- Thornveil Keep\n- The Shattered Coast",
    generationInstruction:
      "Include atmospheric anchors, sensory details, and inherent tensions of the location.",
    exampleFormat:
      "Location Name: Atmosphere, history, and landmarks. Example: The Sunken Market: A damp, claustrophobic bazaar built into the ruins of an old dam. The air smells of salt and rotting wood, and the constant groaning of the rusted supports reminds everyone of the impending flood.",
    filters: ["scrubBrackets"],
    parsingRegex: /^([^:]+):\s*([\s\S]+)$/,
  },
  {
    id: FieldID.SituationalDynamics,
    label: "Situational Dynamics",
    description: "Current conflicts, tensions, and events",
    placeholder: "Active conflicts, pending events...",
    icon: "activity",
    layout: "list",
    fieldType: "dulfs",
    listGenerationInstruction:
      "List only situation/conflict names as short titles.",
    listExampleFormat:
      "- The Succession Crisis\n- Border Tensions\n- The Missing Heir",
    generationInstruction:
      "Describe a current conflict, pending event, or tension that involve multiple characters with no suggested resolution.",
    exampleFormat:
      "Dynamic Name: The nature of the conflict, the stakes, and the primary actors. Example: The Succession Crisis: Three heirs are vying for the throne after the Emperor's sudden death. The city is on the brink of civil war as the military and the merchant guilds begin taking sides.",
    filters: ["scrubBrackets"],
    parsingRegex: /^([^:]+):\s*([\s\S]+)$/,
  },
  {
    id: FieldID.ATTG,
    label: "ATTG",
    description: "Author, Title, Tags, Genre block",
    placeholder: "[ Author: ...; Title: ...; Tags: ...; Genre: ... ]",
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
