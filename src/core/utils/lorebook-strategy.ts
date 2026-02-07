import { RootState } from "../store/types";
import { MessageFactory } from "../../../lib/gen-x";
import { buildStoryEnginePrefix } from "./context-builder";

// Category-to-template mapping
const CATEGORY_TEMPLATE_MAP: Record<string, string> = {
  "SE: Dramatis Personae": "lorebook_template_character",
  "SE: Universe Systems": "lorebook_template_system",
  "SE: Locations": "lorebook_template_location",
  "SE: Factions": "lorebook_template_faction",
  "SE: Situational Dynamics": "lorebook_template_dynamic",
};

// Category-to-type mapping for anchored prefills
const CATEGORY_TO_TYPE: Record<string, string> = {
  "SE: Dramatis Personae": "Character",
  "SE: Universe Systems": "System",
  "SE: Locations": "Location",
  "SE: Factions": "Faction",
  "SE: Situational Dynamics": "Dynamic",
};

const getEntryType = (categoryName: string): string => {
  return CATEGORY_TO_TYPE[categoryName] || "Entry";
};

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

    // Unified prefix (excludes this entry from cross-refs)
    const prefix = await buildStoryEnginePrefix(getState, {
      excludeEntryId: entryId,
    });

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

    messages.push(
      {
        role: "user",
        content: `Generate a lorebook entry for: ${displayName}\n\nITEM DESCRIPTION:\n${itemContent}`,
      },
      { role: "assistant", content: assistantPrefill },
    );

    return {
      messages,
      params: { model, max_tokens: 1024, temperature: 0.85, min_p: 0.05, frequency_penalty: 0.1 },
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

    const displayName = entry.displayName || "Unnamed Entry";
    const entryText = entry.text || "";

    const model = "glm-4-6";
    const prompt = String(
      (await api.v1.config.get("lorebook_keys_prompt")) || "",
    );

    // Unified prefix (excludes this entry from cross-refs)
    const prefix = await buildStoryEnginePrefix(getState, {
      excludeEntryId: entryId,
    });

    const messages: Message[] = [
      ...prefix,
      {
        role: "system",
        content: `[LOREBOOK KEY GENERATION]\n${prompt}`,
      },
      {
        role: "user",
        content: `Entry Name: ${displayName}\n\nEntry Content:\n${entryText}`,
      },
      { role: "assistant", content: `${displayName}, ` },
    ];

    return {
      messages,
      params: {
        model,
        max_tokens: 64,
        temperature: 0.5,
        min_p: 0.05,
        frequency_penalty: 0.3,
        stop: ["\n"],
      },
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

    // Unified prefix (excludes this entry from cross-refs)
    const prefix = await buildStoryEnginePrefix(getState, {
      excludeEntryId: entryId,
    });

    const messages: Message[] = [
      ...prefix,
      {
        role: "system",
        content: `[LOREBOOK ENTRY REFINEMENT]\n${refinePrompt}${template ? `\n\nTEMPLATE:\n${template}` : ""}`,
      },
      {
        role: "user",
        content: `CURRENT ENTRY:\n${currentContent}\n\nMODIFICATION INSTRUCTIONS:\n${instructions}`,
      },
      { role: "assistant", content: prefillContent },
    ];

    return {
      messages,
      params: { model, max_tokens: 1024, temperature: 0.7, min_p: 0.05, frequency_penalty: 0.1 },
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
  // Fetch entry to get displayName for prefill
  const entry = await api.v1.lorebook.entry(entryId);
  const displayName = entry?.displayName || "Unnamed Entry";

  return {
    requestId,
    messageFactory: createLorebookKeysFactory(getState, entryId),
    params: { model: "glm-4-6", max_tokens: 64 },
    target: { type: "lorebookKeys", entryId },
    prefillBehavior: "keep",
    assistantPrefill: `${displayName}, `,
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
