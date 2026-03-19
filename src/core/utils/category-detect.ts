import { FieldID, DulfsFieldID } from "../../config/field-definitions";

const TYPE_TO_FIELD: Record<string, DulfsFieldID> = {
  character: FieldID.DramatisPersonae,
  system: FieldID.UniverseSystems,
  location: FieldID.Locations,
  faction: FieldID.Factions,
  dynamic: FieldID.SituationalDynamics,
  topic: FieldID.Topics,
};

export const DULFS_CATEGORY_CYCLE: DulfsFieldID[] = [
  FieldID.DramatisPersonae,
  FieldID.UniverseSystems,
  FieldID.Locations,
  FieldID.Factions,
  FieldID.SituationalDynamics,
  FieldID.Topics,
];

export const DULFS_CATEGORY_LABELS: Record<DulfsFieldID, string> = {
  [FieldID.DramatisPersonae]: "Character",
  [FieldID.UniverseSystems]: "System",
  [FieldID.Locations]: "Location",
  [FieldID.Factions]: "Faction",
  [FieldID.SituationalDynamics]: "Dynamic",
  [FieldID.Topics]: "Topic",
};

/**
 * Detect the DulfsFieldID category from a lorebook entry's text.
 * Matches the `Type: <word>` line (case-insensitive).
 * Falls back to Topics if no match found.
 */
export function detectCategory(entryText: string): DulfsFieldID {
  const match = entryText.match(/^Type:\s*(\w+)/im);
  if (match) {
    const key = match[1].toLowerCase();
    if (key in TYPE_TO_FIELD) return TYPE_TO_FIELD[key];
  }
  return FieldID.Topics;
}

/**
 * Cycle to the next DulfsFieldID in the display order.
 */
export function cycleDulfsCategory(current: DulfsFieldID): DulfsFieldID {
  const idx = DULFS_CATEGORY_CYCLE.indexOf(current);
  return DULFS_CATEGORY_CYCLE[(idx + 1) % DULFS_CATEGORY_CYCLE.length];
}
