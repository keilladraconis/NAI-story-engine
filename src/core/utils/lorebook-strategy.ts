import { RootState, GenerationStrategy } from "../store/types";
import { MessageFactory } from "nai-gen-x";
import { buildStoryEnginePrefix } from "./context-builder";
import type { RefineContext } from "../chat-types/types";
import { buildRefineTail } from "./refine-strategy";
import { FIELD_CONFIGS } from "../../config/field-definitions";
import { STORAGE_KEYS, EDIT_PANE_TITLE, EDIT_PANE_CONTENT } from "../../ui/framework/ids";
import {
  buildModelParams,
  appendXialongStyleMessage,
  isXialongMode,
  LOREBOOK_CHAIN_STOPS,
} from "./config";
import {
  LOREBOOK_GENERATE_PROMPT,
  LOREBOOK_KEYS_PROMPT,
  CATEGORY_TEMPLATES,
  XIALONG_STYLE,
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

/**
 * Resolve the lorebook category name ("SE: <Label>") driving template + type
 * selection. Category is a Story Engine concept stored on the entity; the
 * lorebook entry's own category is just where it lives in the user's
 * lorebook (they may reorganize imported/long-running entries however they
 * want, and we don't move those). So: for managed entities, trust
 * `entity.categoryId`. For unmanaged entries (no SE entity bound), fall
 * back to `entry.category` as the only available signal.
 */
async function resolveCategoryName(
  state: RootState,
  entryId: string,
  entryCategoryId: string | null | undefined,
): Promise<string> {
  const entity = findEntityForEntry(state, entryId);
  if (entity) {
    const label = FIELD_CONFIGS.find((c) => c.id === entity.categoryId)?.label;
    if (label) return `SE: ${label}`;
  }
  if (entryCategoryId) {
    const categories = await api.v1.lorebook.categories();
    return categories.find((c) => c.id === entryCategoryId)?.name || "";
  }
  return "";
}

/**
 * Resolve the display name for a lorebook entry. Prefers the unsaved draft
 * in the edit pane (storyStorage EDIT_PANE_TITLE) when this entry is the one
 * currently open, so generation reflects what the user typed even before
 * they click Save. Falls back to the persisted names.
 */
async function resolveDisplayName(
  state: RootState,
  entryId: string,
  entryDisplayName: string | undefined,
): Promise<string> {
  const entity = findEntityForEntry(state, entryId);
  const isCurrentlySelected = state.ui.lorebook.selectedEntryId === entryId;
  const liveName = isCurrentlySelected
    ? String((await api.v1.storyStorage.get(EDIT_PANE_TITLE)) || "").trim()
    : "";
  return liveName || entryDisplayName || entity?.name || "Unnamed Entry";
}

/** Format the Threads (groups) an entity belongs to as context text. */
function formatEntityGroups(state: RootState, entityId: string): string {
  const groups = state.world.groups.filter((g) =>
    g.entityIds.includes(entityId),
  );
  if (groups.length === 0) return "";
  return groups.map((g) => `- ${g.title}: ${g.summary}`).join("\n");
}

// --- Factory Builders for JIT Strategy Building ---

/**
 * Creates a message factory for lorebook content generation.
 *
 * Uses the unified Story Engine prefix (system + weaving, state snapshot,
 * world entries, story text) for cache reuse with other strategies, then
 * appends an entity-specific volatile tail.
 *
 * Volatile tail structure (after `buildStoryEnginePrefix`):
 *   - Archivist instructions (LOREBOOK_GENERATE_PROMPT, name-personalized)
 *   - Category template (conditional)
 *   - Thread groups for this entity (conditional)
 *   - User entity summary (immediate context before prefill)
 *   - Xialong style block (Xialong mode only)
 *   - Assistant Name / Type / Setting prefill
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

    const state = getState();
    const entity = findEntityForEntry(state, entryId);

    // Resolve category from Redux first so the template follows the user's
    // current type selection even when the lorebook entry hasn't been moved.
    const categoryName = await resolveCategoryName(state, entryId, entry.category);
    const entryType = getEntryType(categoryName);
    const template = CATEGORY_TEMPLATES[categoryName] || "";

    // Pull name and summary from live input fields only when this entry is
    // currently open in the edit pane — avoids contaminating SEGA batch
    // generation with stale data from whatever entity was last edited.
    const displayName = await resolveDisplayName(state, entryId, entry.displayName);
    const isCurrentlySelected = state.ui.lorebook.selectedEntryId === entryId;
    const liveSummary = isCurrentlySelected
      ? String((await api.v1.storyStorage.get(EDIT_PANE_CONTENT)) || "").trim()
      : "";
    const itemSummary = liveSummary || entity?.summary || "";
    const setting = String(
      (await api.v1.storyStorage.get(STORAGE_KEYS.SETTING)) || "",
    );

    const prefix = await buildStoryEnginePrefix(getState);

    const messages: Message[] = [
      ...prefix,
      {
        role: "system",
        content: LOREBOOK_GENERATE_PROMPT.replace("[itemName]", displayName),
      },
    ];

    if (template) {
      messages.push({ role: "system", content: `TEMPLATE:\n${template}` });
    }

    const groupContext = entity ? formatEntityGroups(state, entity.id) : "";
    if (groupContext) {
      messages.push({ role: "system", content: `[GROUPS]\n${groupContext}` });
    }

    messages.push({
      role: "user",
      content: itemSummary || `Generate a lorebook entry for: ${displayName}`,
    });

    await appendXialongStyleMessage(messages, XIALONG_STYLE.lorebookContent);

    const assistantPrefill = `${displayName}\nType: ${entryType}\nSetting: ${setting || "original"}\n`;
    messages.push({ role: "assistant", content: assistantPrefill });

    const xialong = await isXialongMode();
    return {
      messages,
      params: await buildModelParams({
        max_tokens: 1024,
        temperature: 0.85,
        min_p: 0.05,
        frequency_penalty: 0.1,
        stop: LOREBOOK_CHAIN_STOPS,
      }),
      contextPinning: { head: 1, tail: xialong ? 5 : 4 },
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
    ];

    await appendXialongStyleMessage(messages, XIALONG_STYLE.lorebookKeys);
    messages.push({ role: "assistant", content: `REJECTED:\n` });

    return {
      messages,
      params: await buildModelParams({
        max_tokens: 256,
        temperature: 0.8,
        min_p: 0.1,
        stop: ["\n---", "\n***", "\n⁂", "[ Style", "</think>"],
      }),
      contextPinning: { head: 1, tail: 3 },
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
  params: GenerationParams;
  target: { type: "lorebookKeys"; entryId: string };
  prefillBehavior: "keep";
  assistantPrefill: string;
}> => {
  return {
    requestId,
    messageFactory: createLorebookKeysFactory(getState, entryId),
    params: await buildModelParams({ max_tokens: 256 }),
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
  getState: () => RootState,
  entryId: string,
): Promise<string> => {
  const entry = await api.v1.lorebook.entry(entryId);
  if (!entry) return "";

  const state = getState();
  const displayName = await resolveDisplayName(state, entryId, entry.displayName);
  const categoryName = await resolveCategoryName(state, entryId, entry.category);
  const entryType = getEntryType(categoryName);
  const setting = String(
    (await api.v1.storyStorage.get(STORAGE_KEYS.SETTING)) || "",
  );

  return `${displayName}
Type: ${entryType}
Setting: ${setting}
`;
};

/**
 * Builds a refine-capable GenerationStrategy for lorebook content.
 * Wraps the base factory and appends refine tail when refineContext is present.
 */
export function buildLorebookContentStrategy(
  getState: () => RootState,
  opts?: { refineContext?: RefineContext; entryId?: string; requestId?: string },
): GenerationStrategy {
  const entryId = opts?.entryId ?? "";
  if (!entryId) {
    throw new Error("buildLorebookContentStrategy requires entryId");
  }
  const baseFactory = createLorebookContentFactory(getState, entryId);
  const refineContext = opts?.refineContext;
  const messageFactory: MessageFactory = refineContext
    ? async () => {
        const base = await baseFactory();
        return { ...base, messages: [...base.messages, ...buildRefineTail(refineContext)] };
      }
    : baseFactory;
  return {
    requestId: opts?.requestId ?? api.v1.uuid(),
    messageFactory,
    target: { type: "lorebookContent", entryId },
    prefillBehavior: "keep",
  };
}
