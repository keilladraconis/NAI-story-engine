/**
 * Context Builder - Strategy factories for GLM generation.
 *
 * UNIFIED PREFIX STRATEGY (for token cache efficiency):
 * All Story Engine strategies share a common prefix via buildStoryEnginePrefix().
 * The prefix is story-state context only — each strategy supplies its own system
 * prompt (persona + directives) after the prefix:
 *
 *   MSG 1 (SYSTEM): story state snapshot (ATTG, style,        [STABLE during SEGA]
 *                    setting, brainstorm, canon)
 *   MSG 2 (SYSTEM): World Entry items                         [GROWS during list stage]
 *   MSG 3 (SYSTEM): story text (rolling window)               [VOLATILE — at end]
 *   ─── cache boundary ───
 *   MSG 4+ : strategy-specific instructions + prefill         [VOLATILE]
 *
 * Chat-driven generation lives in chat-strategy.ts and consults the active
 * chat-type spec for its own context slice.
 */

import { RootState } from "../store/types";
import type { SpecCtx } from "../chat-types/types";
import { activeSavedChat } from "../store/slices/chat";
import { getChatTypeSpec } from "../chat-types";
import {
  FieldID,
  FIELD_CONFIGS,
  DulfsFieldID,
} from "../../config/field-definitions";
import { STORAGE_KEYS } from "../../ui/framework/ids";
// --- Helpers ---

/**
 * Extracts the name portion from a World Entry item content using field-specific parsing.
 * Falls back to raw content if no regex match.
 */
export const extractEntityName = (content: string, fieldId: string): string => {
  const fieldConfig = FIELD_CONFIGS.find((f) => f.id === fieldId);
  const regex = fieldConfig?.parsingRegex;

  if (regex) {
    const match = content.match(regex);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  // Fallback: return content up to first colon or full content
  const colonIndex = content.indexOf(":");
  if (colonIndex > 0) {
    return content.substring(0, colonIndex).trim();
  }
  return content.trim();
};

/**
 * Build a context-aware Xialong [ Style: ] guidance block for Style field generation.
 * Derives narrative style tags from shape, intent, and shape description — actual
 * writing-style descriptors (slow-burn, visceral, methodical) rather than role tags.
 */
export function buildXialongNarrativeStyleBlock(state: RootState): string {
  const tags: string[] = [];
  const { shape, intent } = state.foundation ?? {};

  // Shape name as primary style indicator
  if (shape?.name) {
    const shapeName = shape.name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\s+/g, "-")
      .slice(0, 30);
    if (shapeName) tags.push(shapeName);
  }

  // Derive additional tags from intent + shape description
  const context = [intent ?? "", shape?.description ?? ""]
    .join(" ")
    .toLowerCase();

  const markers: [RegExp, string][] = [
    [/slow.burn|deliberate|unhurried|gradual|patient/, "slow-burn"],
    [/methodical|structured|systematic|meticul/, "methodical"],
    [/subtle|understated|implied|nuanced/, "subtle"],
    [/dark|grim|bleak|harsh|brutal/, "dark"],
    [/trauma|ptsd|grief|loss|wound|scar/, "raw"],
    [/sensory|visceral|body|flesh|taste|smell|touch/, "sensory"],
    [/psycholog|mental|interior|introspect/, "psychological"],
    [/intimate|personal|close|private/, "intimate"],
    [/lyric|poetic|prose-poem/, "lyrical"],
    [/epic|grand|sweep|vast|myth/, "expansive"],
    [/tense|thriller|suspense/, "tense"],
    [/comedy|humor|wit|irony|satir/, "sardonic"],
    [/romance|longing|desire|passion|eros/, "yearning"],
    [/horror|terror|dread|uncanny/, "dread"],
    [/action|kinetic|fast.pac|violent|combat/, "kinetic"],
    [/fragment|non.linear|discontinu|elliptic/, "fragmentary"],
  ];

  for (const [pattern, tag] of markers) {
    if (pattern.test(context) && !tags.includes(tag)) {
      tags.push(tag);
      if (tags.length >= 4) break;
    }
  }

  if (tags.length === 0) tags.push("literary", "considered");

  return `[ Style: ${tags.join(", ")} ]`;
}

/**
 * Gets existing WorldEntity summaries for a field, joined with newlines.
 * Returns empty string if no entities exist for the given field.
 */
export const getExistingEntityItems = (
  state: RootState,
  fieldId: DulfsFieldID,
): string => {
  const entities = Object.values(state.world.entitiesById).filter(
    (e) => e.categoryId === fieldId,
  );
  if (entities.length === 0) return "";
  return entities
    .filter((e) => e.summary)
    .map((e) => e.summary)
    .join("\n");
};

/**
 * All World Entry field IDs for iteration.
 */
const ALL_ENTITY_FIELDS: DulfsFieldID[] = [
  FieldID.DramatisPersonae,
  FieldID.UniverseSystems,
  FieldID.Locations,
  FieldID.Factions,
  FieldID.SituationalDynamics,
  FieldID.Topics,
];

/**
 * Gets all WorldEntity summaries grouped by category label.
 * Categories are in fixed order (DP → US → Loc → Fac → SD → Topics).
 * Returns formatted string for context injection.
 */
export const getAllWorldEntityContext = (state: RootState): string => {
  const sections: string[] = [];

  for (const fieldId of ALL_ENTITY_FIELDS) {
    const items = getExistingEntityItems(state, fieldId);
    if (items) {
      const config = FIELD_CONFIGS.find((f) => f.id === fieldId);
      const label = config?.label || fieldId;
      sections.push(`[${label.toUpperCase()}]\n${items}`);
    }
  }

  return sections.join("\n\n");
};

/**
 * Returns the active saved chat's transcript joined as plain text, suitable
 * for forge guidance fallback or other context consumers that don't want the
 * full prefix scaffolding. Empty string when no active chat is available.
 */
export const getActiveChatTranscript = (state: RootState): string => {
  const active = activeSavedChat(state.chat);
  if (!active) return "";
  return active.messages
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n");
};

/**
 * Options for getStoryContextMessages.
 */
export interface StoryContextOptions {
  /** Include lorebook entries (system messages). Default: true */
  includeLorebookEntries?: boolean;
  /** Context limit reduction for buildContext. Default: 4000 */
  contextLimitReduction?: number;
}

/**
 * Gets story context messages from the current story state.
 * Filters out user messages, Author's Note, and optionally lorebook entries.
 * Cleans prefill from assistant messages.
 */
export const getStoryContextMessages = async (
  options: StoryContextOptions = {},
): Promise<Message[]> => {
  const { includeLorebookEntries = true, contextLimitReduction = 4000 } =
    options;

  try {
    const messages = await api.v1.buildContext({ contextLimitReduction });
    const prefill = await api.v1.prefill.get();
    const authorsNote = await api.v1.an.get();

    // First message is always systemPrompt - skip it
    // Keep system messages (lorebook entries) but filter out Author's Note
    // Filter out user messages (user-written instructions)
    // Clean prefill from the last assistant message
    const filtered: Message[] = [];

    for (let i = 1; i < messages.length; i++) {
      const msg = messages[i];

      if (msg.role === "user") {
        // Skip user-written instructions
        continue;
      }

      if (msg.role === "system") {
        // Filter out Author's Note from system messages
        const content = msg.content || "";
        if (authorsNote && content === authorsNote) {
          continue;
        }
        // Optionally filter out lorebook entries (system messages)
        if (!includeLorebookEntries) {
          continue;
        }
        // Keep other system messages (lorebook entries)
        filtered.push(msg);
        continue;
      }

      if (msg.role === "assistant") {
        // Strip prefill from assistant message content
        let content = msg.content || "";

        if (prefill) {
          // Normalize whitespace for comparison (collapse multiple newlines)
          const normalizeWs = (s: string) => s.replace(/\n{2,}/g, "\n");
          const normalizedPrefill = normalizeWs(prefill);
          const normalizedContent = normalizeWs(content);

          if (normalizedContent.startsWith(normalizedPrefill)) {
            // Find where to cut in original content by matching normalized positions
            // Walk through original content, tracking normalized position
            let normalizedPos = 0;
            let cutIndex = 0;
            for (
              let j = 0;
              j < content.length && normalizedPos < normalizedPrefill.length;
              j++
            ) {
              const char = content[j];
              // Skip extra newlines (those that get collapsed in normalization)
              if (char === "\n" && j > 0 && content[j - 1] === "\n") {
                cutIndex = j + 1;
                continue;
              }
              normalizedPos++;
              cutIndex = j + 1;
            }
            content = content.slice(cutIndex).trim();
          }
        }

        if (content) {
          filtered.push({ ...msg, content });
        }
      }
    }

    return filtered;
  } catch {
    return [];
  }
};

// --- Unified Story Engine Prefix ---

/**
 * Builds the shared message prefix for all Story Engine generation strategies.
 * Brainstorm mode is excluded — it uses its own chat-based context.
 *
 * Prefix structure:
 *   MSG 1 (SYSTEM): story state snapshot (ATTG, style,        [STABLE during SEGA]
 *                    setting, brainstorm, canon)
 *   MSG 2 (SYSTEM): World Entry items                         [GROWS during list stage]
 *   MSG 3 (SYSTEM): story text (rolling window)               [VOLATILE — at end]
 *
 * After the prefix, each factory appends its own volatile tail
 * (strategy-specific instructions, prefill, etc.).
 */
export interface StoryEnginePrefixOptions {
  /** Snapshot sections to exclude (e.g., "foundation" when generating foundation fields) */
  excludeSections?: Array<
    | "setting"
    | "attg"
    | "style"
    | "brainstorm"
    | "worldEntities"
    | "storyText"
    | "foundation"
  >;
  /** Skip chat-transcript injection. Set by chat-strategy so it doesn't double-inject the active chat. */
  excludeChat?: boolean;
}

// --- Stable story-state section builders ---
// Shared by buildStoryEnginePrefix (which groups them into the cached MSG 2 /
// MSG 4 messages) and buildForgeBriefing (which freezes them into one message).
// Each returns the formatted block, or "" when its source is empty.

export function formatAttgBlock(state: RootState): string {
  const attg = state.foundation.attg;
  return attg ? `[ATTG]\n${attg}` : "";
}

export function formatStyleBlock(state: RootState): string {
  const style = state.foundation.style;
  return style ? `[STYLE]\n${style}` : "";
}

export function formatFoundationBlock(state: RootState): string {
  const { shape, intent, worldState, intensity, contract } = state.foundation;
  const parts: string[] = [];
  if (shape) parts.push(`Shape: ${shape.name}\n${shape.description}`);
  if (intent) parts.push(`Intent: ${intent}`);
  if (worldState) parts.push(`World State: ${worldState}`);
  if (intensity)
    parts.push(`Intensity: ${intensity.level} — ${intensity.description}`);
  if (contract) {
    const contractLines = [
      `Required (must deliver): ${contract.required}`,
      `Prohibited (never introduce, even subtly, gently, or as incidental flavor): ${contract.prohibited}`,
      `Emphasis (foreground): ${contract.emphasis}`,
    ].join("\n");
    parts.push(
      `Story Contract — binding constraints, honor every line:\n${contractLines}`,
    );
  }
  return parts.length > 0 ? `[NARRATIVE FOUNDATION]\n${parts.join("\n")}` : "";
}

export async function formatSettingBlock(): Promise<string> {
  const setting = String(
    (await api.v1.storyStorage.get(STORAGE_KEYS.SETTING)) || "",
  );
  return setting ? `[SETTING]\n${setting}` : "";
}

export function formatBrainstormBlock(getState: () => RootState): string {
  const state = getState();
  const active = activeSavedChat(state.chat);
  if (!active) return "";
  const ctx: SpecCtx = { getState, dispatch: () => {} };
  const messages = getChatTypeSpec(active.type).contextSlice(active, ctx);
  const chatText = messages
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n");
  return chatText ? `[BRAINSTORM]\n${chatText}` : "";
}

export async function formatStoryTextBlock(): Promise<string> {
  const storyMessages = await getStoryContextMessages({
    includeLorebookEntries: false,
    contextLimitReduction: 8000,
  });
  const storyText = storyMessages
    .filter((m) => m.role === "assistant")
    .map((m) => (m.content ?? "").trim())
    .filter((c) => c !== "***" && c.length > 0)
    .join("\n\n");
  return storyText ? `[STORY TEXT]\n${storyText}` : "";
}

const FORGE_BRIEFING_HEADER =
  "STORY ENGINE BRIEFING — the source material for this forge session. Build the world from this premise.";

/**
 * Assembles the frozen briefing seeded at the top of a forge session: the
 * static story-engine context (foundation, setting, brainstorm, story text).
 * World entities are deliberately excluded — live entities are injected per
 * turn via the strategy's [LIVE] block. Returns "" when there is nothing to say.
 */
export async function buildForgeBriefing(
  getState: () => RootState,
): Promise<string> {
  const state = getState();
  const blocks = [
    formatAttgBlock(state),
    formatStyleBlock(state),
    formatFoundationBlock(state),
    await formatSettingBlock(),
    formatBrainstormBlock(getState),
    await formatStoryTextBlock(),
  ].filter((b) => b.length > 0);
  if (blocks.length === 0) return "";
  return `${FORGE_BRIEFING_HEADER}\n\n${blocks.join("\n\n")}`;
}

export const buildStoryEnginePrefix = async (
  getState: () => RootState,
  options: StoryEnginePrefixOptions = {},
): Promise<Message[]> => {
  const state = getState();
  const excluded = new Set(options.excludeSections || []);

  // --- MSG 1: Story state snapshot (STABLE sections) ---
  // Order: Foundation (tone/intent anchors), then setting/brainstorm, then canon.
  const stableSections: string[] = [];

  // Order: Foundation (tone/intent anchors), then setting, then brainstorm.
  if (!excluded.has("attg")) {
    const b = formatAttgBlock(state);
    if (b) stableSections.push(b);
  }
  if (!excluded.has("style")) {
    const b = formatStyleBlock(state);
    if (b) stableSections.push(b);
  }
  if (!excluded.has("foundation")) {
    const b = formatFoundationBlock(state);
    if (b) stableSections.push(b);
  }
  if (!excluded.has("setting")) {
    const b = await formatSettingBlock();
    if (b) stableSections.push(b);
  }
  // Active chat transcript — the active chat's spec.contextSlice() decides
  // which messages contribute to the prefix.
  if (!excluded.has("brainstorm") && !options.excludeChat) {
    const b = formatBrainstormBlock(getState);
    if (b) stableSections.push(b);
  }

  // --- MSG 2: World Entities (GROWS during list stage, stable during lorebook) ---
  // Separate message so growth doesn't invalidate MSG 2's cached tokens.
  let worldEntityContent = "";
  if (!excluded.has("worldEntities")) {
    const entityContext = getAllWorldEntityContext(state);
    if (entityContext) worldEntityContent = `[WORLD ENTRIES]\n${entityContext}`;
  }

  // --- MSG 3: Story text (VOLATILE — at end of prefix) ---
  // Placed last so frequent changes don't bust cache for stable sections above.
  let storyTextContent = "";
  if (!excluded.has("storyText")) {
    const b = await formatStoryTextBlock();
    if (b) storyTextContent = b;
  }

  // --- Assemble prefix (story-state context only; each task supplies its own
  //     system prompt after this prefix) ---
  const messages: Message[] = [];

  if (stableSections.length > 0) {
    messages.push({
      role: "system",
      content: stableSections.join("\n\n"),
    });
  }

  if (worldEntityContent) {
    messages.push({
      role: "system",
      content: worldEntityContent,
    });
  }

  if (storyTextContent) {
    messages.push({
      role: "system",
      content: storyTextContent,
    });
  }

  return messages;
};
