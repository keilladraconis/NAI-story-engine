/**
 * Relationships Modal
 *
 * Whole-web relationship overview:
 *   - All relationships listed, grouped by "from" entity
 *   - Edit description inline, delete per relationship
 *   - [+ Add] button for manual relationship creation
 */

import { RootState, WorldEntity, AppDispatch } from "../../core/store/types";
import {
  relationshipAdded,
  relationshipRemoved,
  relationshipUpdated,
} from "../../core/store/slices/world";

const { row, text, button, textInput } = api.v1.ui.part;

// ── Styles ─────────────────────────────────────────────────────────────────

const GROUP_HEADER = {
  "font-weight":   "bold",
  "font-size":     "13px",
  "margin-top":    "12px",
  "margin-bottom": "4px",
  "border-bottom": "1px solid rgba(255,255,255,0.1)",
  "padding-bottom": "3px",
};

const REL_ROW    = { gap: "6px", "align-items": "center", padding: "3px 0", "font-size": "13px" };
const ICON_BTN   = { padding: "1px 6px", "font-size": "12px", "flex-shrink": "0" };
const ACTION_BTN = { padding: "2px 8px", "font-size": "12px", "flex-shrink": "0" };
const FORM_ROW   = { gap: "6px", "align-items": "center", "margin-top": "6px", "font-size": "13px" };
const ENTITY_BTN = { "font-size": "12px", "flex-shrink": "0", padding: "2px 6px" };
const DESC_INPUT = { "font-size": "12px", flex: "1" };

const STORAGE_FROM = "lb-relmodal-from-desc";
const STORAGE_EDIT = "lb-relmodal-edit-desc";

// ── Types ──────────────────────────────────────────────────────────────────

export interface RelModalCtx {
  getState: () => RootState;
  dispatch: AppDispatch;
}

// ── Main ───────────────────────────────────────────────────────────────────

export async function openRelationshipsModal(ctx: RelModalCtx): Promise<void> {
  let editingRelId: string | null = null;
  let addFormVisible = false;
  let liveEntities: WorldEntity[] = [];
  let fromIdx = 0;
  let toIdx   = 1;

  const modal = await api.v1.ui.modal.open({
    title:   "Relationships",
    size:    "large",
    content: [text({ text: "Loading..." })],
  });

  async function rebuild(): Promise<void> {
    if (modal.isClosed()) return;

    const state = ctx.getState();
    liveEntities = state.world.entities.filter((e) => e.lifecycle === "live");
    const allRels = state.world.relationships;

    const nameOf = (id: string) =>
      liveEntities.find((e) => e.id === id)?.name || "?";

    const content: UIPart[] = [];

    // === Add relationship form ===
    content.push(
      button({
        text:     addFormVisible ? "▲ Cancel" : "+ Add Relationship",
        style:    ACTION_BTN,
        callback: () => {
          addFormVisible = !addFormVisible;
          if (addFormVisible) {
            fromIdx = Math.min(fromIdx, Math.max(0, liveEntities.length - 1));
            toIdx   = Math.min(toIdx,   Math.max(0, liveEntities.length - 1));
            if (fromIdx === toIdx && liveEntities.length > 1) {
              toIdx = (fromIdx + 1) % liveEntities.length;
            }
          }
          void rebuild();
        },
      }),
    );

    if (addFormVisible && liveEntities.length >= 2) {
      const fromEntity = liveEntities[fromIdx];
      const toEntity   = liveEntities[toIdx];

      content.push(
        row({
          style: FORM_ROW,
          content: [
            button({
              text:     fromEntity?.name ?? "(none)",
              style:    ENTITY_BTN,
              callback: () => {
                fromIdx = (fromIdx + 1) % liveEntities.length;
                if (fromIdx === toIdx) fromIdx = (fromIdx + 1) % liveEntities.length;
                void rebuild();
              },
            }),
            text({ text: "→" }),
            button({
              text:     toEntity?.name ?? "(none)",
              style:    ENTITY_BTN,
              callback: () => {
                toIdx = (toIdx + 1) % liveEntities.length;
                if (toIdx === fromIdx) toIdx = (toIdx + 1) % liveEntities.length;
                void rebuild();
              },
            }),
            textInput({
              initialValue: "",
              placeholder:  "Describe relationship...",
              storageKey:   `story:${STORAGE_FROM}`,
              style:        DESC_INPUT,
            }),
            button({
              text:     "Add",
              style:    ACTION_BTN,
              callback: async () => {
                const currentFrom = liveEntities[fromIdx];
                const currentTo   = liveEntities[toIdx];
                if (!currentFrom || !currentTo || currentFrom.id === currentTo.id) return;
                const desc = String(
                  (await api.v1.storyStorage.get(STORAGE_FROM)) || "",
                ).trim();
                ctx.dispatch(relationshipAdded({
                  relationship: {
                    id:           api.v1.uuid(),
                    fromEntityId: currentFrom.id,
                    toEntityId:   currentTo.id,
                    description:  desc || "related to",
                  },
                }));
                await api.v1.storyStorage.set(STORAGE_FROM, "");
                addFormVisible = false;
                await rebuild();
              },
            }),
          ],
        }),
      );
    } else if (addFormVisible && liveEntities.length < 2) {
      content.push(
        text({
          text:  "Need at least two live entities to create a relationship.",
          style: { opacity: "0.5", "font-size": "12px", padding: "4px 0" },
        }),
      );
    }

    // === Relationships grouped by "from" entity ===
    if (allRels.length === 0 && !addFormVisible) {
      content.push(
        text({
          text:  "No relationships defined yet. Use [+ Add Relationship] to create one.",
          style: { opacity: "0.5", "font-size": "13px", "margin-top": "16px" },
        }),
      );
    } else {
      const fromEntityIds = [...new Set(allRels.map((r) => r.fromEntityId))];
      fromEntityIds.sort((a, b) => nameOf(a).localeCompare(nameOf(b)));

      for (const entityId of fromEntityIds) {
        const entityRels = allRels.filter((r) => r.fromEntityId === entityId);
        if (entityRels.length === 0) continue;

        content.push(text({ text: nameOf(entityId), style: GROUP_HEADER }));

        for (const rel of entityRels) {
          if (editingRelId === rel.id) {
            content.push(
              row({
                style: FORM_ROW,
                content: [
                  text({
                    text:  `${nameOf(rel.fromEntityId)} → ${nameOf(rel.toEntityId)}`,
                    style: { flex: "1", opacity: "0.7" },
                  }),
                  textInput({
                    initialValue: rel.description,
                    placeholder:  "Describe relationship...",
                    storageKey:   `story:${STORAGE_EDIT}`,
                    style:        DESC_INPUT,
                  }),
                  button({
                    text:     "Save",
                    style:    ACTION_BTN,
                    callback: async () => {
                      const desc = String(
                        (await api.v1.storyStorage.get(STORAGE_EDIT)) || "",
                      ).trim();
                      if (desc) {
                        ctx.dispatch(relationshipUpdated({ relationshipId: rel.id, description: desc }));
                      }
                      editingRelId = null;
                      await rebuild();
                    },
                  }),
                  button({
                    text:     "✕",
                    style:    ICON_BTN,
                    callback: () => {
                      editingRelId = null;
                      void rebuild();
                    },
                  }),
                ],
              }),
            );
          } else {
            content.push(
              row({
                style: REL_ROW,
                content: [
                  text({
                    text:  `${nameOf(rel.fromEntityId)} → ${nameOf(rel.toEntityId)}: ${rel.description}`,
                    style: { flex: "1" },
                  }),
                  button({
                    text:     "✎",
                    style:    ICON_BTN,
                    callback: async () => {
                      editingRelId = rel.id;
                      await api.v1.storyStorage.set(STORAGE_EDIT, rel.description);
                      await rebuild();
                    },
                  }),
                  button({
                    text:     "✕",
                    style:    { ...ICON_BTN, opacity: "0.6" },
                    callback: () => {
                      ctx.dispatch(relationshipRemoved({ relationshipId: rel.id }));
                      if (editingRelId === rel.id) editingRelId = null;
                      void rebuild();
                    },
                  }),
                ],
              }),
            );
          }
        }
      }

      // Entities that only appear as "to" (no outgoing rels)
      const toOnlyEntityIds = [
        ...new Set(
          allRels
            .map((r) => r.toEntityId)
            .filter((id) => !fromEntityIds.includes(id)),
        ),
      ];
      toOnlyEntityIds.sort((a, b) => nameOf(a).localeCompare(nameOf(b)));

      for (const entityId of toOnlyEntityIds) {
        const entityRels = allRels.filter((r) => r.toEntityId === entityId);
        if (entityRels.length === 0) continue;

        content.push(text({ text: `← ${nameOf(entityId)}`, style: GROUP_HEADER }));
        for (const rel of entityRels) {
          content.push(
            row({
              style:   { ...REL_ROW, opacity: "0.7" },
              content: [
                text({
                  text:  `${nameOf(rel.fromEntityId)} → ${nameOf(rel.toEntityId)}: ${rel.description}`,
                  style: { flex: "1" },
                }),
              ],
            }),
          );
        }
      }
    }

    if (!modal.isClosed()) {
      await modal.update({ content });
    }
  }

  await rebuild();

  modal.closed.then(() => {
    editingRelId   = null;
    addFormVisible = false;
  });
}
