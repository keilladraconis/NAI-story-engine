import { RootState } from "../store/types";
import { MessageFactory } from "nai-gen-x";
import { buildStoryEnginePrefix, formatCrucibleElementsContext } from "./context-builder";
import { DulfsFieldID, FieldID } from "../../config/field-definitions";

// Category-to-template mapping
const CATEGORY_TEMPLATE_MAP: Record<string, string> = {
  "SE: Dramatis Personae": "lorebook_template_character",
  "SE: Universe Systems": "lorebook_template_system",
  "SE: Locations": "lorebook_template_location",
  "SE: Factions": "lorebook_template_faction",
  "SE: Situational Dynamics": "lorebook_template_dynamic",
};

// Category-to-type mapping for anchored prefills
export const CATEGORY_TO_TYPE: Record<string, string> = {
  "SE: Dramatis Personae": "Character",
  "SE: Universe Systems": "System",
  "SE: Locations": "Location",
  "SE: Factions": "Faction",
  "SE: Situational Dynamics": "Dynamic",
};

const getEntryType = (categoryName: string): string => {
  return CATEGORY_TO_TYPE[categoryName] || "Entry";
};

/**
 * Dependency order for relational map generation.
 * Characters are self-contained; locations/systems/factions/dynamics benefit
 * from character context when building MAP SO FAR.
 */
export const MAP_DEPENDENCY_ORDER: DulfsFieldID[] = [
  FieldID.DramatisPersonae,
  FieldID.Locations,
  FieldID.UniverseSystems,
  FieldID.Factions,
  FieldID.SituationalDynamics,
];

/**
 * Returns true if a relational map entry needs reconciliation:
 * no primary characters identified AND collision risk is high.
 * These entries benefit from a second pass with the complete map as context.
 */
export function parseNeedsReconciliation(mapText: string): boolean {
  const charLine = mapText.match(/- primary characters:\s*(.*)/i)?.[1]?.trim() ?? "";
  const riskLine = mapText.match(/- collision risk:\s*(.*)/i)?.[1]?.trim() ?? "";
  const noChars = !charLine || /^(none|n\/a|—|-)$/i.test(charLine);
  return noChars && /high/i.test(riskLine);
}

// --- Factory Builders for JIT Strategy Building ---

/**
 * Creates a message factory for lorebook content generation.
 * Uses unified prefix (excludes self) + volatile tail with content-specific instruction.
 */
export const createLorebookContentFactory = (
  getState: () => RootState,
  entryId: string,
): MessageFactory => {
  return async () => {
    const entry = await api.v1.lorebook.entry(entryId);
    if (!entry) {
      throw new Error(`Lorebook entry not found: ${entryId}`);
    }

    // Get category name
    let categoryName = "";
    if (entry.category) {
      const categories = await api.v1.lorebook.categories();
      const category = categories.find((c) => c.id === entry.category);
      categoryName = category?.name || "";
    }

    const displayName = entry.displayName || "Unnamed Entry";
    const model = "glm-4-6";
    const basePrompt = String(
      (await api.v1.config.get("lorebook_generate_prompt")) || "",
    );
    const prompt = basePrompt.replace("[itemName]", displayName);

    // Get template based on category
    const templateKey = CATEGORY_TEMPLATE_MAP[categoryName];
    const template = templateKey
      ? String((await api.v1.config.get(templateKey)) || "")
      : "";

    // Item's short description from DULFS
    const itemContent = String(
      (await api.v1.storyStorage.get(`dulfs-item-${entryId}`)) || "",
    );

    // Anchored assistant prefill
    const entryType = getEntryType(categoryName);
    const setting = String(
      (await api.v1.storyStorage.get("kse-setting")) || "",
    );
    const assistantPrefill = `Name: ${displayName}
Type: ${entryType}
Setting: ${setting}
`;

    const prefix = await buildStoryEnginePrefix(getState);

    const messages: Message[] = [
      ...prefix,
      {
        role: "system",
        content: `[LOREBOOK ENTRY GENERATION]\n${prompt}`,
      },
    ];

    // Template after stable prefix (varies per category)
    if (template) {
      messages.push({
        role: "system",
        content: `TEMPLATE:\n${template}`,
      });
    }

    const crucibleContext = formatCrucibleElementsContext(getState());
    if (crucibleContext) {
      messages.push({
        role: "system",
        content: `[WORLD STRUCTURE]\n${crucibleContext}`,
      });
    }

    messages.push(
      {
        role: "user",
        content: `Generate a lorebook entry for: ${displayName}\n\nITEM DESCRIPTION:\n${itemContent}`,
      },
      { role: "assistant", content: assistantPrefill },
    );

    const tailCount = template ? (crucibleContext ? 5 : 4) : (crucibleContext ? 4 : 3);
    return {
      messages,
      params: { model, max_tokens: 1024, temperature: 0.85, min_p: 0.05, frequency_penalty: 0.1 },
      contextPinning: { head: 1, tail: tailCount },
    };
  };
};

/**
 * Creates a message factory for lorebook relational map generation.
 * Reads MAP SO FAR from state at JIT time, enabling incremental cross-entry inference.
 * Characters → Locations → Systems → Factions → Dynamics (MAP_DEPENDENCY_ORDER).
 */
export const createLorebookRelationalMapFactory = (
  getState: () => RootState,
  entryId: string,
): MessageFactory => {
  return async () => {
    const entry = await api.v1.lorebook.entry(entryId);
    if (!entry) {
      throw new Error(`Lorebook entry not found: ${entryId}`);
    }

    let categoryName = "";
    if (entry.category) {
      const categories = await api.v1.lorebook.categories();
      const category = categories.find((c) => c.id === entry.category);
      categoryName = category?.name || "";
    }

    const displayName = entry.displayName || "Unnamed Entry";
    const entryType = getEntryType(categoryName);
    const entryText = entry.text || "";

    // Build MAP SO FAR: all maps in dependency order, excluding this entry
    const state = getState();
    const mapSoFarParts: string[] = [];
    for (const fieldId of MAP_DEPENDENCY_ORDER) {
      const items = state.story.dulfs[fieldId] || [];
      for (const item of items) {
        if (item.id === entryId) continue;
        const mapText = state.runtime.sega.relationalMaps[item.id];
        if (mapText) mapSoFarParts.push(mapText);
      }
    }
    const mapSoFar = mapSoFarParts.join("\n\n");

    const model = "glm-4-6";
    const prompt = String(
      (await api.v1.config.get("lorebook_relational_map_prompt")) || "",
    );

    const prefix = await buildStoryEnginePrefix(getState);

    const messages: Message[] = [
      ...prefix,
      {
        role: "system",
        content: `[LOREBOOK RELATIONAL MAP]\n${prompt}`,
      },
      {
        role: "user",
        content: `MAP SO FAR:\n${mapSoFar || "(none yet)"}\n\n---\n\nENTRY:\n${entryText}`,
      },
      {
        role: "assistant",
        content: `${displayName} [${entryType}]\n  - primary locations:`,
      },
    ];

    return {
      messages,
      params: {
        model,
        max_tokens: 256,
        temperature: 0.5,
        stop: ["\n\n---", "\n\n\n"],
      },
      contextPinning: { head: 1, tail: 3 },
    };
  };
};

/**
 * Creates a message factory for lorebook keys generation.
 * Uses unified prefix (excludes self) + volatile tail with keys-specific instruction.
 * CRITICAL: Fetches entry.text at execution time for fresh content from preceding generation.
 */
export const createLorebookKeysFactory = (
  getState: () => RootState,
  entryId: string,
): MessageFactory => {
  return async () => {
    const entry = await api.v1.lorebook.entry(entryId);
    if (!entry) {
      throw new Error(`Lorebook entry not found: ${entryId}`);
    }

    // Prefer relational map over raw prose — falls back to prose when running
    // outside SEGA or after SEGA reset.
    const relationalMap = getState().runtime.sega.relationalMaps[entryId] ?? "";
    const entryText = relationalMap || (entry.text || "");

    const model = "glm-4-6";
    const prompt = String(
      (await api.v1.config.get("lorebook_keys_prompt")) || "",
    );

    const prefix = await buildStoryEnginePrefix(getState);

    const messages: Message[] = [
      ...prefix,
      {
        role: "system",
        content: `[LOREBOOK KEY GENERATION]\n${prompt}`,
      },
      {
        role: "user",
        content: `ENTRY:\n\n${entryText}`,
      },
      { role: "assistant", content: `REJECTED:\n` },
    ];

    return {
      messages,
      params: {
        model,
        max_tokens: 256,
        temperature: 0.8,
        min_p: 0.1,
        stop: ["\n---"],
      },
      contextPinning: { head: 1, tail: 3 },
    };
  };
};

/**
 * Creates a message factory for lorebook entry refinement.
 * Uses unified prefix (excludes self) + volatile tail with refine-specific instruction.
 */
export const createLorebookRefineFactory = (
  getState: () => RootState,
  entryId: string,
  getInstructions: () => Promise<string>,
): MessageFactory => {
  return async () => {
    const entry = await api.v1.lorebook.entry(entryId);
    if (!entry) {
      throw new Error(`Lorebook entry not found: ${entryId}`);
    }

    const displayName = entry.displayName || "Unnamed Entry";
    const currentContent = entry.text || "";
    const instructions = await getInstructions();

    // Get category name for type and template
    let categoryName = "";
    if (entry.category) {
      const categories = await api.v1.lorebook.categories();
      const category = categories.find((c) => c.id === entry.category);
      categoryName = category?.name || "";
    }

    const entryType = getEntryType(categoryName);
    const setting = String(
      (await api.v1.storyStorage.get("kse-setting")) || "",
    );

    // Get template based on category
    const templateKey = CATEGORY_TEMPLATE_MAP[categoryName];
    const template = templateKey
      ? String((await api.v1.config.get(templateKey)) || "")
      : "";

    // Anchored assistant prefill
    const prefillContent = `Name: ${displayName}
Type: ${entryType}
Setting: ${setting}
`;

    const model = "glm-4-6";
    const refinePrompt = String(
      (await api.v1.config.get("lorebook_refine_prompt")) || "",
    );

    const prefix = await buildStoryEnginePrefix(getState);

    const crucibleContext = formatCrucibleElementsContext(getState());

    const messages: Message[] = [
      ...prefix,
      {
        role: "system",
        content: `[LOREBOOK ENTRY REFINEMENT]\n${refinePrompt}${template ? `\n\nTEMPLATE:\n${template}` : ""}`,
      },
    ];

    if (crucibleContext) {
      messages.push({
        role: "system",
        content: `[WORLD STRUCTURE]\n${crucibleContext}`,
      });
    }

    messages.push(
      {
        role: "user",
        content: `CURRENT ENTRY:\n${currentContent}\n\nMODIFICATION INSTRUCTIONS:\n${instructions}`,
      },
      { role: "assistant", content: prefillContent },
    );

    return {
      messages,
      params: { model, max_tokens: 1024, temperature: 0.7, min_p: 0.05, frequency_penalty: 0.1 },
      contextPinning: { head: 1, tail: crucibleContext ? 4 : 3 },
    };
  };
};

/**
 * Builds the complete generation payload for lorebook keys.
 * Consolidates factory creation, prefill setup, and params in one place.
 */
export const buildLorebookKeysPayload = async (
  getState: () => RootState,
  entryId: string,
  requestId: string,
): Promise<{
  requestId: string;
  messageFactory: MessageFactory;
  params: { model: string; max_tokens: number };
  target: { type: "lorebookKeys"; entryId: string };
  prefillBehavior: "keep";
  assistantPrefill: string;
}> => {
  return {
    requestId,
    messageFactory: createLorebookKeysFactory(getState, entryId),
    params: { model: "glm-4-6", max_tokens: 256 },
    target: { type: "lorebookKeys", entryId },
    prefillBehavior: "keep",
    assistantPrefill: `REJECTED:\n`,
  };
};

/**
 * Helper to build the lorebook prefill content (Name/Type/Setting header).
 * Used by handlers to prepend to generated content.
 */
export const buildLorebookPrefill = async (
  entryId: string,
): Promise<string> => {
  const entry = await api.v1.lorebook.entry(entryId);
  if (!entry) return "";

  const displayName = entry.displayName || "Unnamed Entry";

  // Get category name for type
  let categoryName = "";
  if (entry.category) {
    const categories = await api.v1.lorebook.categories();
    const category = categories.find((c) => c.id === entry.category);
    categoryName = category?.name || "";
  }

  const entryType = getEntryType(categoryName);
  const setting = String(
    (await api.v1.storyStorage.get("kse-setting")) || "",
  );

  return `Name: ${displayName}
Type: ${entryType}
Setting: ${setting}
`;
};
