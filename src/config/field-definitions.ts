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
      "Focus on the core motivation and unique behavioral tell of the character.",
    exampleFormat:
      "Name (Gender, Age, Role): Core motivation, Unique behavioral tell. Example: Kael (Male, 34, Smuggler): To pay off his life debt, Rubs a coin when calculating odds",
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
      "Describe the key universe system, law, or technological principle, its mechanics/terms, and its broader impact on the world.",
    exampleFormat:
      "System Name: Description of mechanic, societal impact, and rules. Example: Aetheric Resonance: High-frequency crystals can levitate heavy objects when sung to at specific pitches. This system forms the backbone of the empire's sky-fleets but causes 'harmonic sickness' in long-term pilots.",
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
      "Include atmospheric anchors, sensory details, and inherent tensions of the location.",
    exampleFormat:
      "Location Name: Atmosphere, history, and landmarks. Example: The Sunken Market: A damp, claustrophobic bazaar built into the ruins of an old dam. The air smells of salt and rotting wood, and the constant groaning of the rusted supports reminds everyone of the impending flood.",
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
      "Describe the faction's core ideology, history, and its role in the world's power dynamics.",
    exampleFormat:
      "Faction Name: Goal, history, and public face vs. private reality. Example: The Iron Pact: A militaristic group dedicated to border protection. Publicly they are heroes, but privately they are hoarding ancient artifacts to trigger a pre-emptive strike against their rivals.",
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
      "Describe a narrative vector: a direction of pressure or volatile situation. Focus on the FACTORS that create tension, not what WILL happen. Include multiple actors and their competing interests.",
    exampleFormat:
      "Vector Name: The nature of the tension, the competing pressures, and the actors involved. Example: The Succession Crisis: Three heirs each have legitimate claims. The military favors strength, the merchants favor stability, the clergy favor tradition. No resolution is predetermined—the outcome emerges from play.",
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
