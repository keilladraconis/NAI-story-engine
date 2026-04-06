import { RootState } from "../store/types";
import { MessageFactory } from "nai-gen-x";
import { buildStoryEnginePrefix } from "./context-builder";
import { DulfsFieldID, FIELD_CONFIGS } from "../../config/field-definitions";
import { STORAGE_KEYS } from "../../ui/framework/ids";
import { WORLD_ENTRY_CATEGORIES } from "../store/types";
import { getModel } from "./config";

// Category-to-template mapping
const CATEGORY_TEMPLATE_MAP: Record<string, string> = {
  "SE: Characters": "lorebook_template_character",
  "SE: Systems": "lorebook_template_system",
  "SE: Locations": "lorebook_template_location",
  "SE: Factions": "lorebook_template_faction",
  "SE: Narrative Vectors": "lorebook_template_dynamic",
  "SE: Topics": "lorebook_template_topic",
};

// Category-to-type mapping for anchored prefills
export const CATEGORY_TO_TYPE: Record<string, string> = {
  "SE: Characters": "Character",
  "SE: Systems": "System",
  "SE: Locations": "Location",
  "SE: Factions": "Faction",
  "SE: Narrative Vectors": "Dynamic",
  "SE: Topics": "Topic",
};

const getEntryType = (categoryName: string): string => {
  return CATEGORY_TO_TYPE[categoryName] || "Entry";
};

// --- v11 World Context Helpers ---

/** Find the WorldEntity associated with a lorebook entry ID, if any. */
function findEntityForEntry(state: RootState, entryId: string) {
  return state.world.entities.find((e) => e.lorebookEntryId === entryId);
}

/** Format the relationships of a specific entity as context text. */
function formatEntityRelationships(state: RootState, entityId: string): string {
  const rels = state.world.relationships.filter(
    (r) => r.fromEntityId === entityId || r.toEntityId === entityId,
  );
  if (rels.length === 0) return "";

  const lines = rels.map((r) => {
    const fromName =
      state.world.entities.find((e) => e.id === r.fromEntityId)?.name || "";
    const toName =
      state.world.entities.find((e) => e.id === r.toEntityId)?.name || "";
    return `- ${fromName} → ${toName}: ${r.description}`;
  });
  return lines.join("\n");
}

/** Format live world entities as context, grouped by category. */
function formatLiveWorldEntitiesContext(state: RootState): string {
  const liveEntities = state.world.entities.filter(
    (e) => e.lifecycle === "live",
  );
  if (liveEntities.length === 0) return "";

  const groups = new Map<DulfsFieldID, typeof liveEntities>();
  for (const entity of liveEntities) {
    const list = groups.get(entity.categoryId) || [];
    list.push(entity);
    groups.set(entity.categoryId, list);
  }

  const lines: string[] = [];
  for (const fieldId of WORLD_ENTRY_CATEGORIES) {
    const fieldEntities = groups.get(fieldId);
    if (!fieldEntities) continue;
    const label = FIELD_CONFIGS.find((f) => f.id === fieldId)?.label || fieldId;
    lines.push(`${label}:`);
    for (const entity of fieldEntities) {
      lines.push(
        `- ${entity.name}${entity.summary ? `: ${entity.summary.slice(0, 100)}` : ""}`,
      );
    }
  }
  return lines.join("\n");
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
    const model = await getModel();
    const basePrompt = String(
      (await api.v1.config.get("lorebook_generate_prompt")) || "",
    );
    const prompt = basePrompt.replace("[itemName]", displayName);

    // Get template based on category
    const templateKey = CATEGORY_TEMPLATE_MAP[categoryName];
    const template = templateKey
      ? String((await api.v1.config.get(templateKey)) || "")
      : "";

    // Resolve entity early so its summary is available as item description fallback
    const state = getState();
    const entity = findEntityForEntry(state, entryId);

    // Item's short description: DULFS storage (backward compat) or entity summary (v11)
    const dulfsContent = String(
      (await api.v1.storyStorage.get(STORAGE_KEYS.dulfsItem(entryId))) || "",
    );
    const itemContent = dulfsContent || entity?.summary || "";

    // Anchored assistant prefill
    const entryType = getEntryType(categoryName);
    const setting = String(
      (await api.v1.storyStorage.get(STORAGE_KEYS.SETTING)) || "",
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

    // v11 world context: live entities grouped by category
    const worldContext = formatLiveWorldEntitiesContext(state);
    if (worldContext) {
      messages.push({
        role: "system",
        content: `[WORLD STRUCTURE]\n${worldContext}`,
      });
    }

    // Entity-specific relationships from v11 world slice
    const relContext = entity
      ? formatEntityRelationships(state, entity.id)
      : "";
    if (relContext) {
      messages.push({
        role: "system",
        content: `[RELATIONSHIPS]\n${relContext}`,
      });
    }

    messages.push(
      {
        role: "user",
        content: `Generate a lorebook entry for: ${displayName}\n\nITEM DESCRIPTION:\n${itemContent}`,
      },
      { role: "assistant", content: assistantPrefill },
    );

    const tailCount =
      (template ? 1 : 0) + (worldContext ? 1 : 0) + (relContext ? 1 : 0) + 3;
    return {
      messages,
      params: {
        model,
        max_tokens: 1024,
        temperature: 0.85,
        min_p: 0.05,
        frequency_penalty: 0.1,
      },
      contextPinning: { head: 1, tail: tailCount },
    };
  };
};

/**
/**
 * Creates a message factory for lorebook keys generation.
 * Uses unified prefix + entry text + relationship context.
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

    const entryText = entry.text || "";
    const model = await getModel();
    const prompt = String(
      (await api.v1.config.get("lorebook_keys_prompt")) || "",
    );

    const prefix = await buildStoryEnginePrefix(getState);

    // Build relationship context for this entry from v11 world slice
    const state = getState();
    const entity = findEntityForEntry(state, entryId);
    const relContext = entity
      ? formatEntityRelationships(state, entity.id)
      : "";

    const contextContent = relContext
      ? `${entryText}\n\n${relContext}`
      : entryText;

    const messages: Message[] = [
      ...prefix,
      {
        role: "system",
        content: `[LOREBOOK KEY GENERATION]\n${prompt}`,
      },
      {
        role: "user",
        content: `ENTRY:\n\n${contextContent}`,
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
      (await api.v1.storyStorage.get(STORAGE_KEYS.SETTING)) || "",
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

    const model = await getModel();
    const refinePrompt = String(
      (await api.v1.config.get("lorebook_refine_prompt")) || "",
    );

    const prefix = await buildStoryEnginePrefix(getState);

    // v11 world context
    const state = getState();
    const entity = findEntityForEntry(state, entryId);
    const relContext = entity
      ? formatEntityRelationships(state, entity.id)
      : "";

    const messages: Message[] = [
      ...prefix,
      {
        role: "system",
        content: `[LOREBOOK ENTRY REFINEMENT]\n${refinePrompt}${template ? `\n\nTEMPLATE:\n${template}` : ""}`,
      },
    ];

    if (relContext) {
      messages.push({
        role: "system",
        content: `[RELATIONSHIPS]\n${relContext}`,
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
      params: {
        model,
        max_tokens: 1024,
        temperature: 0.7,
        min_p: 0.05,
        frequency_penalty: 0.1,
      },
      contextPinning: { head: 1, tail: relContext ? 4 : 3 },
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
    params: { model: await getModel(), max_tokens: 256 },
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
    (await api.v1.storyStorage.get(STORAGE_KEYS.SETTING)) || "",
  );

  return `Name: ${displayName}
Type: ${entryType}
Setting: ${setting}
`;
};
