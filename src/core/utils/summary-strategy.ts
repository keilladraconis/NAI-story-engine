/**
 * Summary generation strategies.
 *
 * Entity summary: brief internal SE description with forge-style world context.
 * Thread summary: description of the thread's narrative dynamic from its members.
 *
 * Both stream to EDIT_PANE_CONTENT storyStorage key so the open edit pane
 * displays the result in real time.
 */

import { MessageFactory } from "nai-gen-x";
import { RootState } from "../store/types";
import { WORLD_ENTRY_CATEGORIES } from "../store/types";
import { DulfsFieldID, FieldID } from "../../config/field-definitions";
import {
  ENTITY_SUMMARY_PROMPT,
  ENTITY_SUMMARY_FROM_LOREBOOK_PROMPT,
  THREAD_SUMMARY_PROMPT,
} from "./prompts";
import { getModel } from "./config";
import { EDIT_PANE_TITLE } from "../../ui/framework/ids";

const FIELD_LABEL: Record<DulfsFieldID, string> = {
  [FieldID.DramatisPersonae]: "Character",
  [FieldID.UniverseSystems]: "System",
  [FieldID.Locations]: "Location",
  [FieldID.Factions]: "Faction",
  [FieldID.SituationalDynamics]: "Situation",
  [FieldID.Topics]: "Topic",
};

function formatLiveEntities(state: RootState): string {
  const live = state.world.entities.filter((e) => e.lifecycle === "live");
  if (live.length === 0) return "";

  const groups = new Map<DulfsFieldID, typeof live>();
  for (const e of live) {
    const list = groups.get(e.categoryId) ?? [];
    list.push(e);
    groups.set(e.categoryId, list);
  }

  const lines: string[] = ["=== ESTABLISHED WORLD ==="];
  for (const fieldId of WORLD_ENTRY_CATEGORIES) {
    const group = groups.get(fieldId);
    if (!group) continue;
    lines.push(`${FIELD_LABEL[fieldId]}s:`);
    for (const e of group) {
      lines.push(
        `  - ${e.name}${e.summary ? `: ${e.summary.slice(0, 100)}` : ""}`,
      );
    }
  }
  return lines.join("\n");
}

export function createEntitySummaryFactory(
  getState: () => RootState,
  entityId: string,
): MessageFactory {
  return async () => {
    const state = getState();
    const entity = state.world.entities.find((e) => e.id === entityId);
    const { foundation } = state;

    const messages: Message[] = [];

    messages.push({ role: "system", content: ENTITY_SUMMARY_PROMPT });

    if (foundation.shape) {
      messages.push({
        role: "assistant",
        content: `=== STORY SHAPE ===\n${foundation.shape.name}\n${foundation.shape.description}`,
      });
    }

    if (foundation.intent) {
      messages.push({
        role: "assistant",
        content: `=== STORY INTENT ===\n${foundation.intent}`,
      });
    }

    if (foundation.worldState) {
      messages.push({
        role: "assistant",
        content: `=== WORLD STATE ===\n${foundation.worldState}`,
      });
    }

    const establishedWorld = formatLiveEntities(state);
    if (establishedWorld) {
      messages.push({ role: "assistant", content: establishedWorld });
    }

    const categoryLabel = entity?.categoryId
      ? FIELD_LABEL[entity.categoryId]
      : "Entity";
    // Read live name from the open edit pane's storageKey field — falls back to
    // Redux state for entities opened without a pane (e.g. programmatic calls).
    const liveName = String(
      (await api.v1.storyStorage.get(EDIT_PANE_TITLE)) || entity?.name || "",
    ).trim();
    const nameLabel = liveName ? `"${liveName}"` : "this entity";

    const userContent = `Generate a summary for ${nameLabel} (${categoryLabel}).`;

    messages.push({ role: "user", content: userContent });

    return {
      messages,
      params: {
        model: await getModel(),
        max_tokens: 150,
        temperature: 0.9,
        min_p: 0.05,
      },
    };
  };
}

export function createEntitySummaryFromLorebookFactory(
  getState: () => RootState,
  entityId: string,
): MessageFactory {
  return async () => {
    const state = getState();
    const entity = state.world.entities.find((e) => e.id === entityId);
    if (!entity?.lorebookEntryId) {
      return {
        messages: [],
        params: { model: await getModel(), max_tokens: 150 },
      };
    }

    const entry = await api.v1.lorebook.entry(entity.lorebookEntryId);
    const entryText = entry?.text?.trim() ?? "";

    const messages: Message[] = [
      { role: "system", content: ENTITY_SUMMARY_FROM_LOREBOOK_PROMPT },
      {
        role: "user",
        content: `Name: ${entity.name}\n\n${entryText}`,
      },
    ];

    return {
      messages,
      params: {
        model: await getModel(),
        max_tokens: 150,
        temperature: 0.8,
        min_p: 0.05,
      },
    };
  };
}

export function createThreadSummaryFactory(
  getState: () => RootState,
  groupId: string,
): MessageFactory {
  return async () => {
    const state = getState();
    const group = state.world.groups.find((g) => g.id === groupId);
    const { foundation } = state;

    const messages: Message[] = [];

    messages.push({ role: "system", content: THREAD_SUMMARY_PROMPT });

    if (foundation.shape) {
      messages.push({
        role: "assistant",
        content: `=== STORY SHAPE ===\n${foundation.shape.name}\n${foundation.shape.description}`,
      });
    }

    if (foundation.intent) {
      messages.push({
        role: "assistant",
        content: `=== STORY INTENT ===\n${foundation.intent}`,
      });
    }

    const members = (group?.entityIds ?? [])
      .map((id) => state.world.entities.find((e) => e.id === id))
      .filter((e): e is NonNullable<typeof e> => e !== undefined);

    const memberLines = members
      .map((e) =>
        e.summary ? `- ${e.name}: ${e.summary}` : `- ${e.name}`,
      )
      .join("\n");

    const titleLabel = group?.title ? `"${group.title}"` : "this thread";

    const userLines: string[] = [];
    userLines.push(`Thread: ${titleLabel}`);
    if (memberLines) {
      userLines.push(`Members:\n${memberLines}`);
    }
    userLines.push("Generate a summary describing this thread's dynamic.");

    messages.push({ role: "user", content: userLines.join("\n") });

    return {
      messages,
      params: {
        model: await getModel(),
        max_tokens: 100,
        temperature: 0.9,
        min_p: 0.05,
      },
    };
  };
}
