import { RootState, GenerationStrategy } from "../store/types";
import { MessageFactory } from "../../../lib/gen-x";
import { FieldID } from "../../config/field-definitions";
import { getAllDulfsContext } from "./context-builder";

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

const getFieldContent = (state: RootState, id: string): string => {
  return state.story.fields[id]?.content || "";
};

export const buildLorebookContentStrategy = async (
  state: RootState,
  entryId: string,
  categoryName: string,
  displayName: string,
): Promise<GenerationStrategy> => {
  const model = "glm-4-6";
  const systemPrompt = String((await api.v1.config.get("system_prompt")) || "");
  const basePrompt = String(
    (await api.v1.config.get("lorebook_generate_prompt")) || "",
  );

  // Get template based on category
  const templateKey = CATEGORY_TEMPLATE_MAP[categoryName];
  const template = templateKey
    ? String((await api.v1.config.get(templateKey)) || "")
    : "";

  // Replace placeholder in base prompt
  const prompt = basePrompt.replace("[itemName]", displayName);

  const canon = getFieldContent(state, FieldID.Canon);

  // Get DULFS context and the specific item's short description
  const dulfsContext = await getAllDulfsContext(state);
  const itemContent = String(
    (await api.v1.storyStorage.get(`dulfs-item-${entryId}`)) || "",
  );

  const messages: Message[] = [
    {
      role: "system",
      content: `${systemPrompt}\n\n[LOREBOOK ENTRY GENERATION]\n${prompt}${template ? `\n\nTEMPLATE:\n${template}` : ""}`,
    },
    {
      role: "user",
      content: `Generate a lorebook entry for: ${displayName}\n\nITEM DESCRIPTION:\n${itemContent}\n\nCANON:\n${canon}\n\nSTORY ELEMENTS:\n${dulfsContext}`,
    },
    { role: "assistant", content: "" },
  ];

  return {
    requestId: api.v1.uuid(),
    messages,
    params: { model, max_tokens: 512, temperature: 0.85, min_p: 0.05, frequency_penalty: 0.1 },
    target: { type: "lorebookContent", entryId },
    prefixBehavior: "trim",
  };
};

export const buildLorebookKeysStrategy = async (
  entryId: string,
  displayName: string,
  entryText: string,
): Promise<GenerationStrategy> => {
  const model = "glm-4-6";
  const systemPrompt = String((await api.v1.config.get("system_prompt")) || "");
  const prompt = String(
    (await api.v1.config.get("lorebook_keys_prompt")) || "",
  );

  const messages: Message[] = [
    {
      role: "system",
      content: `${systemPrompt}\n\n[LOREBOOK KEY GENERATION]\n${prompt}`,
    },
    {
      role: "user",
      content: `Entry Name: ${displayName}\n\nEntry Content:\n${entryText}`,
    },
    { role: "assistant", content: "" },
  ];

  return {
    requestId: api.v1.uuid(),
    messages,
    params: { model, max_tokens: 64, temperature: 0.5, min_p: 0.05, frequency_penalty: 0.3 },
    target: { type: "lorebookKeys", entryId },
    prefixBehavior: "trim",
  };
};

// --- Factory Builders for JIT Strategy Building ---

/**
 * Creates a message factory for lorebook content generation.
 * The factory captures context but defers data fetching until execution time.
 */
export const createLorebookContentFactory = (
  getState: () => RootState,
  entryId: string,
): MessageFactory => {
  return async () => {
    const state = getState();
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
    const systemPrompt = String(
      (await api.v1.config.get("system_prompt")) || "",
    );
    const basePrompt = String(
      (await api.v1.config.get("lorebook_generate_prompt")) || "",
    );

    // Get template based on category
    const templateKey = CATEGORY_TEMPLATE_MAP[categoryName];
    const template = templateKey
      ? String((await api.v1.config.get(templateKey)) || "")
      : "";

    // Replace placeholder in base prompt
    const prompt = basePrompt.replace("[itemName]", displayName);

    const canon = getFieldContent(state, FieldID.Canon);

    // Get DULFS context and the specific item's short description
    const dulfsContext = await getAllDulfsContext(state);
    const itemContent = String(
      (await api.v1.storyStorage.get(`dulfs-item-${entryId}`)) || "",
    );

    // Build anchored assistant prefill to prevent veering to other entries
    const entryType = getEntryType(categoryName);
    const setting = String(
      (await api.v1.storyStorage.get("kse-setting")) || "",
    );
    const assistantPrefill = `Name: ${displayName}
Type: ${entryType}
Setting: ${setting}
`;

    const messages: Message[] = [
      {
        role: "system",
        content: `${systemPrompt}\n\n[LOREBOOK ENTRY GENERATION]\n${prompt}${template ? `\n\nTEMPLATE:\n${template}` : ""}`,
      },
      {
        role: "user",
        content: `Generate a lorebook entry for: ${displayName}\n\nITEM DESCRIPTION:\n${itemContent}\n\nCANON:\n${canon}\n\nSTORY ELEMENTS:\n${dulfsContext}`,
      },
      { role: "assistant", content: assistantPrefill },
    ];

    return {
      messages,
      params: { model, max_tokens: 1024, temperature: 0.85, min_p: 0.05, frequency_penalty: 0.1 },
    };
  };
};

/**
 * Creates a message factory for lorebook keys generation.
 * CRITICAL: This fetches entry.text at execution time, so it gets fresh content
 * from any preceding content generation.
 */
export const createLorebookKeysFactory = (entryId: string): MessageFactory => {
  return async () => {
    // Fetch FRESH entry.text at execution time
    const entry = await api.v1.lorebook.entry(entryId);
    if (!entry) {
      throw new Error(`Lorebook entry not found: ${entryId}`);
    }

    const displayName = entry.displayName || "Unnamed Entry";
    const entryText = entry.text || ""; // Now has content from previous generation

    const model = "glm-4-6";
    const systemPrompt = String(
      (await api.v1.config.get("system_prompt")) || "",
    );
    const prompt = String(
      (await api.v1.config.get("lorebook_keys_prompt")) || "",
    );

    const messages: Message[] = [
      {
        role: "system",
        content: `${systemPrompt}\n\n[LOREBOOK KEY GENERATION]\n${prompt}`,
      },
      {
        role: "user",
        content: `Entry Name: ${displayName}\n\nEntry Content:\n${entryText}`,
      },
      { role: "assistant", content: "" },
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
 * Allows users to modify existing lorebook entries with natural language instructions.
 */
export const createLorebookRefineFactory = (
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

    // Get template based on category (same as content generation)
    const templateKey = CATEGORY_TEMPLATE_MAP[categoryName];
    const template = templateKey
      ? String((await api.v1.config.get(templateKey)) || "")
      : "";

    // Build anchored assistant prefill (---- header handled by NAI category defaults)
    const prefillContent = `Name: ${displayName}
Type: ${entryType}
Setting: ${setting}
`;

    const model = "glm-4-6";
    const systemPrompt = String(
      (await api.v1.config.get("system_prompt")) || "",
    );
    const refinePrompt = String(
      (await api.v1.config.get("lorebook_refine_prompt")) || "",
    );

    const messages: Message[] = [
      {
        role: "system",
        content: `${systemPrompt}\n\n[LOREBOOK ENTRY REFINEMENT]\n${refinePrompt}${template ? `\n\nTEMPLATE:\n${template}` : ""}`,
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
