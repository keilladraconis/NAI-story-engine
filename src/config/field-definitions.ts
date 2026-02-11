export enum FieldID {
  Canon = "canon",
  Brainstorm = "brainstorm",
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
  | FieldID.Canon
  | FieldID.Brainstorm
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
    FieldID.Canon,
    FieldID.Brainstorm,
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
  | "canon"
  | "brainstorm"
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
    id: FieldID.Canon,
    label: "Canon",
    description: "Bedrock facts: world, characters, themes, tone — the foundation for all generation",
    placeholder: "The facts of your story world...",
    icon: "bookOpen",
    fieldType: "canon",
    generationInstruction:
      "Distill the story's bedrock: world facts, character starting states, thematic tensions, and tonal identity.",
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
      "One line per character: name, demographics, core motivation, and one behavioral tell. Be terse.",
    exampleFormat:
      "Name (Gender, Age, Role): Motivation. Behavioral tell.\nExample: Kael (Male, 34, Smuggler): Paying off a life debt. Rubs a coin when calculating odds.",
    filters: ["scrubBrackets", "scrubMarkdown"],
    parsingRegex: /^([^:(]+)\s*\(([^,]+),\s*([^,]+),\s*([^)]+)\):\s*([\s\S]+)$/,
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
      "One line per system: name, core mechanic, and key cost or constraint. No worldbuilding prose.",
    exampleFormat:
      "System Name: Core mechanic; cost/constraint.\nExample: Aetheric Resonance: Sung crystals levitate mass; causes harmonic sickness in long-term pilots.",
    filters: ["scrubBrackets", "scrubMarkdown"],
    parsingRegex: /^([^:]+):\s*([\s\S]+)$/,
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
      "One line per location: name, function, and one sensory anchor. No history or prose.",
    exampleFormat:
      "Location Name: Function; sensory anchor.\nExample: The Sunken Market: Black-market bazaar in old dam ruins; damp, groaning supports.",
    filters: ["scrubBrackets", "scrubMarkdown"],
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
      "One line per faction: name, stated goal, and hidden reality or key tension. No history.",
    exampleFormat:
      "Faction Name: Public goal; private reality.\nExample: The Iron Pact: Border protectors publicly; secretly hoarding artifacts for a pre-emptive strike.",
    filters: ["scrubBrackets", "scrubMarkdown"],
    parsingRegex: /^([^:]+):\s*([\s\S]+)$/,
  },
  {
    id: FieldID.SituationalDynamics,
    label: "Situational Dynamics",
    description: "Narrative vectors: tensions, pressures, and volatile situations",
    placeholder: "Directions of pressure, not predetermined outcomes...",
    icon: "activity",
    layout: "list",
    fieldType: "dulfs",
    listGenerationInstruction:
      "List only narrative vector titles—tensions, pressures, or volatile situations (NOT plot events or outcomes).",
    listExampleFormat:
      "- The Succession Crisis\n- Border Tensions\n- The Missing Heir",
    generationInstruction:
      "One line per vector: name and competing pressures. Actors and stakes only, no outcomes.",
    exampleFormat:
      "Vector Name: Competing pressures and actors.\nExample: The Succession Crisis: Three legitimate heirs; military, merchants, and clergy each back different candidates.",
    filters: ["scrubBrackets", "scrubMarkdown"],
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
