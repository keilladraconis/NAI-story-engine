import { RootState } from "../store/types";
import { MessageFactory } from "nai-gen-x";
import { buildStoryEnginePrefix } from "./context-builder";
import { DulfsFieldID, FieldID, FIELD_CONFIGS } from "../../config/field-definitions";
import { STORAGE_KEYS, EDIT_PANE_TITLE, EDIT_PANE_CONTENT } from "../../ui/framework/ids";
import { WORLD_ENTRY_CATEGORIES } from "../store/types";
import { getModel } from "./config";
import {
  LOREBOOK_GENERATE_PROMPT,
  LOREBOOK_KEYS_PROMPT,
  LOREBOOK_REFINE_PROMPT,
  LOREBOOK_WEAVING_PROMPT,
  CATEGORY_TEMPLATES,
} from "./prompts";


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
  return Object.values(state.world.entitiesById).find((e) => e.lorebookEntryId === entryId);
}

/** Format the Threads (groups) an entity belongs to as context text. */
function formatEntityGroups(state: RootState, entityId: string): string {
  const groups = state.world.groups.filter((g) =>
    g.entityIds.includes(entityId),
  );
  if (groups.length === 0) return "";
  return groups.map((g) => `- ${g.title}: ${g.summary}`).join("\n");
}

/** Format live world entities as context, grouped by category. */
function formatLiveWorldEntitiesContext(state: RootState): string {
  const liveEntities = Object.values(state.world.entitiesById).filter(
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
 *
 * Message structure:
 *   MSG 1 (system): Archivist instructions (LOREBOOK_GENERATE_PROMPT)
 *   MSG 2 (system): Story background — foundation, canon, setting, ATTG, style
 *   MSG 3 (system): Category template (varies per entry type)
 *   MSG 4 (system): World context — live entities + weaving prompt + thread groups
 *   MSG 5 (user):   Entity summary (immediate context before prefill)
 *   MSG 6 (asst):   Name / Type / Setting prefill (anchors output format)
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

    // Resolve category name for template + type label
    let categoryName = "";
    if (entry.category) {
      const categories = await api.v1.lorebook.categories();
      const cat = categories.find((c) => c.id === entry.category);
      categoryName = cat?.name || "";
    }

    const model = await getModel();
    const entryType = getEntryType(categoryName);
    const template = CATEGORY_TEMPLATES[categoryName] || "";

    const state = getState();
    const entity = findEntityForEntry(state, entryId);

    // Pull name and summary from live input fields first — user may have typed
    // without saving. Fall back to persisted values.
    const liveName = String(
      (await api.v1.storyStorage.get(EDIT_PANE_TITLE)) || "",
    ).trim();
    const displayName = liveName || entry.displayName || entity?.name || "Unnamed Entry";

    const liveSummary = String(
      (await api.v1.storyStorage.get(EDIT_PANE_CONTENT)) || "",
    ).trim();
    const dulfsContent = String(
      (await api.v1.storyStorage.get(STORAGE_KEYS.dulfsItem(entryId))) || "",
    );
    const itemSummary = liveSummary || dulfsContent || entity?.summary || "";

    // --- MSG 1: Archivist instructions ---
    const messages: Message[] = [
      {
        role: "system",
        content: LOREBOOK_GENERATE_PROMPT.replace("[itemName]", displayName),
      },
    ];

    // --- MSG 2: Story background ---
    const { foundation } = state;
    const backgroundParts: string[] = [];
    if (foundation.attg) backgroundParts.push(`[ATTG]\n${foundation.attg}`);
    if (foundation.style) backgroundParts.push(`[STYLE]\n${foundation.style}`);
    if (foundation.shape || foundation.intent || foundation.worldState) {
      const fp: string[] = [];
      if (foundation.shape) fp.push(`Shape: ${foundation.shape.name}\n${foundation.shape.description}`);
      if (foundation.intent) fp.push(`Intent: ${foundation.intent}`);
      if (foundation.worldState) fp.push(`World State: ${foundation.worldState}`);
      backgroundParts.push(`[NARRATIVE FOUNDATION]\n${fp.join("\n")}`);
    }
    const canon = state.story.fields[FieldID.Canon]?.content || "";
    if (canon) backgroundParts.push(`[CANON]\n${canon}`);
    const setting = String(
      (await api.v1.storyStorage.get(STORAGE_KEYS.SETTING)) || "",
    );
    if (setting) backgroundParts.push(`[SETTING]\n${setting}`);
    if (backgroundParts.length > 0) {
      messages.push({ role: "system", content: backgroundParts.join("\n\n") });
    }

    // --- MSG 3: Category template ---
    if (template) {
      messages.push({ role: "system", content: `TEMPLATE:\n${template}` });
    }

    // --- MSG 4: World context + weaving ---
    const worldContext = formatLiveWorldEntitiesContext(state);
    const groupContext = entity ? formatEntityGroups(state, entity.id) : "";
    const worldParts: string[] = [];
    if (worldContext) worldParts.push(`[WORLD]\n${worldContext}`);
    if (groupContext) worldParts.push(`[GROUPS]\n${groupContext}`);
    if (LOREBOOK_WEAVING_PROMPT) worldParts.push(LOREBOOK_WEAVING_PROMPT);
    if (worldParts.length > 0) {
      messages.push({ role: "system", content: worldParts.join("\n\n") });
    }

    // --- MSG 5: Entity summary (right before prefill) ---
    messages.push({
      role: "user",
      content: itemSummary || `Generate a lorebook entry for: ${displayName}`,
    });

    // --- MSG 6: Anchored prefill ---
    const assistantPrefill = `Name: ${displayName}\nType: ${entryType}\nSetting: ${setting || "original"}\n`;
    messages.push({ role: "assistant", content: assistantPrefill });

    return {
      messages,
      params: {
        model,
        max_tokens: 1024,
        temperature: 0.85,
        min_p: 0.05,
        frequency_penalty: 0.1,
      },
      contextPinning: { head: 1, tail: 3 },
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
    const prompt = LOREBOOK_KEYS_PROMPT;

    const prefix = await buildStoryEnginePrefix(getState);

    // Thread (group) context for this entry
    const state = getState();
    const entity = findEntityForEntry(state, entryId);
    const groupContext = entity
      ? formatEntityGroups(state, entity.id)
      : "";

    const contextContent = groupContext
      ? `${entryText}\n\n${groupContext}`
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
    const template = CATEGORY_TEMPLATES[categoryName] || "";

    // Anchored assistant prefill
    const prefillContent = `Name: ${displayName}
Type: ${entryType}
Setting: ${setting}
`;

    const model = await getModel();
    const refinePrompt = LOREBOOK_REFINE_PROMPT;

    const prefix = await buildStoryEnginePrefix(getState);

    // Thread (group) context
    const state = getState();
    const entity = findEntityForEntry(state, entryId);
    const groupContext = entity
      ? formatEntityGroups(state, entity.id)
      : "";

    const messages: Message[] = [
      ...prefix,
      {
        role: "system",
        content: `[LOREBOOK ENTRY REFINEMENT]\n${refinePrompt}${template ? `\n\nTEMPLATE:\n${template}` : ""}`,
      },
    ];

    if (groupContext) {
      messages.push({
        role: "system",
        content: `[GROUPS]\n${groupContext}`,
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
      contextPinning: { head: 1, tail: groupContext ? 4 : 3 },
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
