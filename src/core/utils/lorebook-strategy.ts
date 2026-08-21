import { RootState, GenerationStrategy } from "../store/types";
import { MessageFactory } from "nai-gen-x";
import { buildStoryEnginePrefix } from "./context-builder";
import type { RefineContext } from "../chat-types/types";
import { buildRefineTail } from "./refine-strategy";
import { FIELD_CONFIGS } from "../../config/field-definitions";
import { STORAGE_KEYS, EDIT_PANE_TITLE, EDIT_PANE_CONTENT } from "../keys";
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
  return Object.values(state.world.entitiesById).find(
    (e) => e.lorebookEntryId === entryId,
  );
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

/** Format the Threads an entity belongs to as context text. */
function formatEntityThreads(state: RootState, entityId: string): string {
  const threads = state.world.threads.filter((t) =>
    t.entityIds.includes(entityId),
  );
  if (threads.length === 0) return "";
  return threads.map((t) => `- ${t.title}: ${t.text}`).join("\n");
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
 *   - Thread threads for this entity (conditional)
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
    const categoryName = await resolveCategoryName(
      state,
      entryId,
      entry.category,
    );
    const entryType = getEntryType(categoryName);
    const template = CATEGORY_TEMPLATES[categoryName] || "";

    // Pull name and summary from live input fields only when this entry is
    // currently open in the edit pane — avoids contaminating SEGA batch
    // generation with stale data from whatever entity was last edited.
    const displayName = await resolveDisplayName(
      state,
      entryId,
      entry.displayName,
    );
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

    const threadContext = entity ? formatEntityThreads(state, entity.id) : "";
    if (threadContext) {
      messages.push({ role: "system", content: `[GROUPS]\n${threadContext}` });
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

    // Thread (thread) context for this entry
    const state = getState();
    const entity = findEntityForEntry(state, entryId);
    const threadContext = entity ? formatEntityThreads(state, entity.id) : "";

    const contextContent = threadContext
      ? `${entryText}\n\n${threadContext}`
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

    await appendXialongStyleMessage(
      messages,
      XIALONG_STYLE.lorebookKeys,
      "instruct",
    );
    messages.push({ role: "assistant", content: `REJECTED:\n` });

    return {
      messages,
      params: await buildModelParams(
        {
          max_tokens: 256,
          temperature: 0.8,
          min_p: 0.1,
          stop: ["\n---", "---", "\n***", "\n⁂", "[ Style", "</think>"],
        },
        "instruct",
      ),
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
    params: await buildModelParams({ max_tokens: 256 }, "instruct"),
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
  const displayName = await resolveDisplayName(
    state,
    entryId,
    entry.displayName,
  );
  const categoryName = await resolveCategoryName(
    state,
    entryId,
    entry.category,
  );
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
 * Total generation calls one lorebook entry may spend — the first plus its
 * continuations. Entries are written at 1024 tokens (see
 * `createLorebookContentFactory`); a longer one used to be saved exactly where
 * the cap fell, mid-sentence. Continuations only fire when the model was cut
 * off rather than finishing, so a normal entry still costs a single call.
 */
export const LOREBOOK_CONTENT_MAX_CALLS = 4;

/**
 * Builds the complete generation payload for lorebook content.
 *
 * The single source of truth for every lorebook content generation — the edit
 * pane, the entity item pass, SEGA, and entity binding all go through here, so
 * they cannot drift apart on token budget or continuation behaviour. Params
 * come from the factory itself (JIT, so they reflect the entry at execution
 * time) rather than being restated per callsite.
 */
export const buildLorebookContentPayload = (
  getState: () => RootState,
  entryId: string,
  requestId: string,
): GenerationStrategy => ({
  requestId,
  messageFactory: createLorebookContentFactory(getState, entryId),
  target: { type: "lorebookContent", entryId },
  prefillBehavior: "trim",
  continuation: { maxCalls: LOREBOOK_CONTENT_MAX_CALLS },
});

/**
 * Builds a refine-capable GenerationStrategy for lorebook content.
 * Wraps the base factory and appends refine tail when refineContext is present.
 */
export function buildLorebookContentStrategy(
  getState: () => RootState,
  opts?: {
    refineContext?: RefineContext;
    entryId?: string;
    requestId?: string;
  },
): GenerationStrategy {
  const entryId = opts?.entryId ?? "";
  if (!entryId) {
    throw new Error("buildLorebookContentStrategy requires entryId");
  }
  const base = buildLorebookContentPayload(
    getState,
    entryId,
    opts?.requestId ?? api.v1.uuid(),
  );
  const refineContext = opts?.refineContext;
  if (!refineContext) return base;

  const baseFactory = base.messageFactory as MessageFactory;
  const messageFactory: MessageFactory = async () => {
    const resolved = await baseFactory();
    return {
      ...resolved,
      messages: buildRefineTail(resolved.messages, refineContext),
    };
  };
  return { ...base, messageFactory };
}
