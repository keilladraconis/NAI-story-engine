import { BindContext, defineComponent } from "nai-act";
import { RootState } from "../../../core/store/types";
import { DulfsFieldID } from "../../../config/field-definitions";
import { IDS, STORAGE_KEYS } from "../../framework/ids";
import { GenerationButton } from "../GenerationButton";
import {
  uiLorebookContentGenerationRequested,
  uiLorebookKeysGenerationRequested,
  uiLorebookRefineRequested,
} from "../../../core/store/slices/ui";
import {
  entityReforgeRequested,
  entityUnbound,
  entityBound,
  batchCreated,
  relationshipAdded,
} from "../../../core/store/slices/world";
import {
  detectCategory,
  cycleDulfsCategory,
  DULFS_CATEGORY_LABELS,
} from "../../../core/utils/category-detect";
import { RelationshipRow, RelationshipRowProps } from "./RelationshipRow";

const { column, text, row, textInput, multilineTextInput, button } = api.v1.ui.part;

export const LorebookPanelContent = defineComponent({
  id: () => IDS.LOREBOOK.CONTAINER,

  styles: {
    container: { height: "100%" },
    stateContainer: {
      display: "flex",
      "align-items": "center",
      "justify-content": "center",
      padding: "20px",
      color: "rgba(255,255,255,0.5)",
    },
    mainContent: { height: "100%" },
    entryName: { "font-weight": "bold", "font-size": "16px", flex: "1" },
    lifecycleBadge: {
      "font-size": "11px",
      opacity: "0.5",
      "font-style": "italic",
      "flex-shrink": "0",
    },
    buttonRow: { gap: "8px", "margin-top": "4px" },
    contentInput: { "font-size": "13px", flex: "auto" },
    keysRow: { gap: "8px", "align-items": "center" },
    keysLabel: {
      "font-size": "12px",
      color: "rgba(255,255,255,0.6)",
      "white-space": "nowrap",
    },
    keysInput: { "font-size": "12px", flex: "1" },
    refineRow: { gap: "8px", "align-items": "center", "margin-top": "8px" },
    refineInput: { "font-size": "12px", flex: "1" },
    relsHeader: { gap: "8px", "align-items": "center", "margin-top": "12px" },
    relsLabel: { "font-size": "12px", color: "rgba(255,255,255,0.5)", flex: "1" },
    addRelBtn: { padding: "2px 8px", "font-size": "12px" },
    relsList: { gap: "2px", "margin-top": "4px" },
    relForm: { gap: "6px", "align-items": "center", "margin-top": "4px" },
    relFormTargetBtn: { "font-size": "12px", "flex-shrink": "0", padding: "2px 6px" },
    relFormDesc: { "font-size": "12px", flex: "1" },
    relFormAction: { "font-size": "12px", padding: "2px 8px", "flex-shrink": "0" },
    actionRow: { gap: "8px", "margin-top": "12px" },
    actionBtn: { flex: "1", "font-size": "0.85em", padding: "4px 8px" },
    unbindBtn: { flex: "1", "font-size": "0.85em", padding: "4px 8px", opacity: "0.6" },
    bindRow: { gap: "8px", "margin-top": "8px" },
    bindBtn: { flex: "1" },
    categoryBtn: { "font-size": "12px", "flex-shrink": "0", padding: "3px 8px" },
    hidden: { display: "none" },
    visible: { display: "flex" },
  },

  build(_props: void, ctx: BindContext<RootState>) {
    const { useSelector, getState, dispatch } = ctx;

    // Closure state
    let currentEntryId: string | null = null;
    let currentCategoryId: DulfsFieldID = "topics" as DulfsFieldID;
    let currentEntityId: string | null = null;
    // For add-relationship form
    let relFormVisible = false;
    let availableEntities: Array<{ id: string; name: string }> = [];
    let targetIdx = 0;

    // ── Generation buttons ──────────────────────────────────────────────────

    const { part: contentBtn } = ctx.render(GenerationButton, {
      id: IDS.LOREBOOK.GEN_CONTENT_BTN,
      label: "⚡ Regen Content",
      stateProjection: (state: RootState) => state.ui.lorebook.selectedEntryId,
      requestIdFromProjection: (entryId: string | null) =>
        entryId ? IDS.LOREBOOK.entry(entryId).CONTENT_REQ : undefined,
      isDisabledFromProjection: (entryId: string | null) => !entryId,
      onGenerate: () => {
        const selectedEntryId = getState().ui.lorebook.selectedEntryId;
        if (selectedEntryId) {
          const requestId = IDS.LOREBOOK.entry(selectedEntryId).CONTENT_REQ;
          dispatch(uiLorebookContentGenerationRequested({ requestId }));
        }
      },
    });

    const { part: keysBtn } = ctx.render(GenerationButton, {
      id: IDS.LOREBOOK.GEN_KEYS_BTN,
      label: "⚡ Regen Keys",
      stateProjection: (state: RootState) => state.ui.lorebook.selectedEntryId,
      requestIdFromProjection: (entryId: string | null) =>
        entryId ? IDS.LOREBOOK.entry(entryId).KEYS_REQ : undefined,
      isDisabledFromProjection: (entryId: string | null) => !entryId,
      onGenerate: () => {
        const selectedEntryId = getState().ui.lorebook.selectedEntryId;
        if (selectedEntryId) {
          const requestId = IDS.LOREBOOK.entry(selectedEntryId).KEYS_REQ;
          dispatch(uiLorebookKeysGenerationRequested({ requestId }));
        }
      },
    });

    const { part: refineBtn } = ctx.render(GenerationButton, {
      id: IDS.LOREBOOK.REFINE_BTN,
      label: "Refine",
      stateProjection: (state: RootState) => state.ui.lorebook.selectedEntryId,
      requestIdFromProjection: (entryId: string | null) =>
        entryId ? IDS.LOREBOOK.entry(entryId).REFINE_REQ : undefined,
      onGenerate: () => {
        const selectedEntryId = getState().ui.lorebook.selectedEntryId;
        if (selectedEntryId) {
          const requestId = IDS.LOREBOOK.entry(selectedEntryId).REFINE_REQ;
          dispatch(uiLorebookRefineRequested({ requestId }));
        }
      },
    });

    // ── Relationships (bindList) ─────────────────────────────────────────────

    const relListContent = ctx.bindList(
      IDS.LOREBOOK.RELATIONSHIPS_LIST,
      (state): RelationshipRowProps[] => {
        const entryId = state.ui.lorebook.selectedEntryId;
        if (!entryId) return [];
        const entity = state.world.entities.find((e) => e.lorebookEntryId === entryId);
        if (!entity) return [];
        return state.world.relationships
          .filter((r) => r.fromEntityId === entity.id || r.toEntityId === entity.id)
          .map((r) => ({
            relId: r.id,
            fromName: state.world.entities.find((e) => e.id === r.fromEntityId)?.name || "?",
            toName: state.world.entities.find((e) => e.id === r.toEntityId)?.name || "?",
            description: r.description,
          }));
      },
      (item) => item.relId,
      (item) => ({ component: RelationshipRow, props: item }),
    );

    // ── Add-relationship form helpers ────────────────────────────────────────

    const showRelForm = () => {
      const state = getState();
      availableEntities = state.world.entities
        .filter((e) => e.lifecycle === "live" && e.id !== currentEntityId)
        .map((e) => ({ id: e.id, name: e.name }));
      targetIdx = 0;
      const targetLabel =
        availableEntities.length > 0
          ? availableEntities[0].name
          : "(no entities)";

      relFormVisible = true;
      api.v1.ui.updateParts([
        { id: IDS.LOREBOOK.REL_FORM, style: this.style?.("relForm", "visible") },
        { id: IDS.LOREBOOK.REL_FORM_TARGET_BTN, text: targetLabel },
      ]);
    };

    const hideRelForm = () => {
      relFormVisible = false;
      api.v1.ui.updateParts([
        { id: IDS.LOREBOOK.REL_FORM, style: this.style?.("relForm", "hidden") },
      ]);
      api.v1.storyStorage.set(STORAGE_KEYS.REL_FORM_DESC, "");
    };

    // ── Subscriptions ────────────────────────────────────────────────────────

    // Main panel switch: fires when entry changes or managed status changes
    useSelector(
      (state) => {
        const entryId = state.ui.lorebook.selectedEntryId;
        const isManaged = entryId
          ? state.world.entities.some((e) => e.lorebookEntryId === entryId)
          : false;
        return { entryId, isManaged };
      },
      async ({ entryId, isManaged }) => {
        // Hide all panels
        api.v1.ui.updateParts([
          { id: IDS.LOREBOOK.EMPTY_STATE, style: this.style?.("stateContainer", "hidden") },
          { id: IDS.LOREBOOK.NOT_MANAGED, style: this.style?.("stateContainer", "hidden") },
          { id: IDS.LOREBOOK.MAIN_CONTENT, style: this.style?.("mainContent", "hidden") },
        ]);

        currentEntryId = entryId;
        currentEntityId = null;
        hideRelForm();

        if (!entryId) {
          api.v1.ui.updateParts([
            { id: IDS.LOREBOOK.EMPTY_STATE, style: this.style?.("stateContainer", "visible") },
          ]);
          return;
        }

        const entry = await api.v1.lorebook.entry(entryId);
        if (!entry) {
          api.v1.ui.updateParts([
            { id: IDS.LOREBOOK.EMPTY_STATE, style: this.style?.("stateContainer", "visible") },
          ]);
          return;
        }

        if (!isManaged) {
          // Show bind view with auto-detected category
          const detected = detectCategory(entry.text || "");
          currentCategoryId = detected;
          api.v1.ui.updateParts([
            { id: IDS.LOREBOOK.NOT_MANAGED, style: this.style?.("stateContainer", "visible") },
            {
              id: IDS.LOREBOOK.CATEGORY_BTN,
              text: `Category: ${DULFS_CATEGORY_LABELS[currentCategoryId]} ▶`,
            },
          ]);
          return;
        }

        // Managed entry: find entity
        const entity = getState().world.entities.find((e) => e.lorebookEntryId === entryId);
        currentEntityId = entity?.id ?? null;

        const displayName = entry.displayName || "Unnamed Entry";
        const currentContent = entry.text || "";
        const currentKeys = entry.keys?.join(", ") || "";

        await api.v1.storyStorage.set(IDS.LOREBOOK.CONTENT_DRAFT_RAW, currentContent);
        await api.v1.storyStorage.set(IDS.LOREBOOK.KEYS_DRAFT_RAW, currentKeys);

        api.v1.ui.updateParts([
          { id: IDS.LOREBOOK.MAIN_CONTENT, style: this.style?.("mainContent", "visible") },
          { id: IDS.LOREBOOK.ENTRY_NAME, text: displayName },
          {
            id: IDS.LOREBOOK.LIFECYCLE_BADGE,
            text: entity ? `[${entity.lifecycle}]` : "",
          },
        ]);

        // Wire onChange for direct lorebook updates
        api.v1.ui.updateParts([
          {
            id: IDS.LOREBOOK.CONTENT_INPUT,
            onChange: async (value: string) => {
              if (currentEntryId) {
                const erato = (await api.v1.config.get("erato_compatibility")) || false;
                const text = erato && !value.startsWith("----\n") ? "----\n" + value : value;
                await api.v1.lorebook.updateEntry(currentEntryId, { text });
              }
            },
          },
          {
            id: IDS.LOREBOOK.KEYS_INPUT,
            onChange: async (value: string) => {
              if (currentEntryId) {
                const keys = value
                  .split(",")
                  .map((k) => k.trim())
                  .filter((k) => k.length > 0);
                await api.v1.lorebook.updateEntry(currentEntryId, { keys });
              }
            },
          },
        ]);
      },
      (a, b) => a.entryId === b.entryId && a.isManaged === b.isManaged,
    );

    // Lifecycle badge reactive update (catches Cast changes without entry switch)
    useSelector(
      (state) => {
        const entryId = state.ui.lorebook.selectedEntryId;
        return entryId
          ? state.world.entities.find((e) => e.lorebookEntryId === entryId)?.lifecycle ?? ""
          : "";
      },
      (lifecycle) => {
        api.v1.ui.updateParts([
          {
            id: IDS.LOREBOOK.LIFECYCLE_BADGE,
            text: lifecycle ? `[${lifecycle}]` : "",
          },
        ]);
      },
    );

    // ── Static structure ─────────────────────────────────────────────────────

    return column({
      id: IDS.LOREBOOK.CONTAINER,
      style: this.style?.("container"),
      content: [
        // Empty state
        column({
          id: IDS.LOREBOOK.EMPTY_STATE,
          style: this.style?.("stateContainer", "visible"),
          content: [text({ text: "Select a Lorebook entry to generate content." })],
        }),

        // Unmanaged / bind view
        column({
          id: IDS.LOREBOOK.NOT_MANAGED,
          style: this.style?.("stateContainer", "hidden"),
          content: [
            text({
              text: "This entry is not managed by Story Engine.",
              style: { "margin-bottom": "8px", "text-align": "center" },
            }),
            row({
              style: this.style?.("bindRow"),
              content: [
                button({
                  id: IDS.LOREBOOK.BIND_BTN,
                  text: "⚡ Bind to Story Engine",
                  style: this.style?.("bindBtn"),
                  callback: async () => {
                    const state = getState();
                    const entryId = currentEntryId;
                    if (!entryId) return;

                    // Find or create "Imported" batch
                    let importedBatch = state.world.batches.find((b) => b.name === "Imported");
                    let batchId: string;
                    if (!importedBatch) {
                      batchId = api.v1.uuid();
                      dispatch(batchCreated({ batch: { id: batchId, name: "Imported", entityIds: [] } }));
                    } else {
                      batchId = importedBatch.id;
                    }

                    // Fetch entry displayName
                    const entry = await api.v1.lorebook.entry(entryId);
                    const name = entry?.displayName || "Unknown";

                    dispatch(
                      entityBound({
                        entity: {
                          id: api.v1.uuid(),
                          batchId,
                          categoryId: currentCategoryId,
                          lifecycle: "live",
                          lorebookEntryId: entryId,
                          name,
                          summary: "",
                        },
                      }),
                    );
                    api.v1.ui.toast(`Bound: ${name}`, { type: "success" });
                  },
                }),
                button({
                  id: IDS.LOREBOOK.CATEGORY_BTN,
                  text: `Category: ${DULFS_CATEGORY_LABELS[currentCategoryId]} ▶`,
                  style: this.style?.("categoryBtn"),
                  callback: () => {
                    currentCategoryId = cycleDulfsCategory(currentCategoryId);
                    api.v1.ui.updateParts([
                      {
                        id: IDS.LOREBOOK.CATEGORY_BTN,
                        text: `Category: ${DULFS_CATEGORY_LABELS[currentCategoryId]} ▶`,
                      },
                    ]);
                  },
                }),
              ],
            }),
          ],
        }),

        // Managed main content
        column({
          id: IDS.LOREBOOK.MAIN_CONTENT,
          style: this.style?.("mainContent", "hidden"),
          content: [
            // Entry name + lifecycle badge
            row({
              style: { "align-items": "center", gap: "8px", "margin-bottom": "2px" },
              content: [
                text({
                  id: IDS.LOREBOOK.ENTRY_NAME,
                  text: "",
                  style: this.style?.("entryName"),
                }),
                text({
                  id: IDS.LOREBOOK.LIFECYCLE_BADGE,
                  text: "",
                  style: this.style?.("lifecycleBadge"),
                }),
              ],
            }),

            // Generation buttons
            row({
              style: this.style?.("buttonRow"),
              content: [contentBtn, keysBtn],
            }),

            // Content textarea
            multilineTextInput({
              id: IDS.LOREBOOK.CONTENT_INPUT,
              initialValue: "",
              placeholder: "Lorebook content...",
              storageKey: IDS.LOREBOOK.CONTENT_DRAFT_KEY,
              style: this.style?.("contentInput"),
            }),

            // Keys row
            row({
              style: this.style?.("keysRow"),
              content: [
                text({ text: "Keys:", style: this.style?.("keysLabel") }),
                textInput({
                  id: IDS.LOREBOOK.KEYS_INPUT,
                  initialValue: "",
                  placeholder: "comma, separated, keys",
                  storageKey: IDS.LOREBOOK.KEYS_DRAFT_KEY,
                  style: this.style?.("keysInput"),
                }),
              ],
            }),

            // Refine row
            row({
              style: this.style?.("refineRow"),
              content: [
                textInput({
                  id: IDS.LOREBOOK.REFINE_INSTRUCTIONS_INPUT,
                  initialValue: "",
                  placeholder: "Describe changes...",
                  storageKey: IDS.LOREBOOK.REFINE_INSTRUCTIONS_KEY,
                  style: this.style?.("refineInput"),
                }),
                refineBtn,
              ],
            }),

            // Relationships section
            row({
              style: this.style?.("relsHeader"),
              content: [
                text({ text: "Relationships", style: this.style?.("relsLabel") }),
                button({
                  id: IDS.LOREBOOK.ADD_REL_BTN,
                  text: "+ Add",
                  style: this.style?.("addRelBtn"),
                  callback: () => {
                    if (relFormVisible) {
                      hideRelForm();
                    } else {
                      showRelForm();
                    }
                  },
                }),
              ],
            }),
            column({
              id: IDS.LOREBOOK.RELATIONSHIPS_LIST,
              style: this.style?.("relsList"),
              content: relListContent,
            }),

            // Add-relationship form (hidden by default)
            row({
              id: IDS.LOREBOOK.REL_FORM,
              style: this.style?.("relForm", "hidden"),
              content: [
                button({
                  id: IDS.LOREBOOK.REL_FORM_TARGET_BTN,
                  text: "(no entities)",
                  style: this.style?.("relFormTargetBtn"),
                  callback: () => {
                    if (availableEntities.length === 0) return;
                    targetIdx = (targetIdx + 1) % availableEntities.length;
                    api.v1.ui.updateParts([
                      {
                        id: IDS.LOREBOOK.REL_FORM_TARGET_BTN,
                        text: availableEntities[targetIdx].name,
                      },
                    ]);
                  },
                }),
                textInput({
                  id: IDS.LOREBOOK.REL_FORM_DESC,
                  initialValue: "",
                  placeholder: "Describe relationship...",
                  storageKey: STORAGE_KEYS.REL_FORM_DESC_UI,
                  style: this.style?.("relFormDesc"),
                }),
                button({
                  id: IDS.LOREBOOK.REL_FORM_ADD_BTN,
                  text: "Add",
                  style: this.style?.("relFormAction"),
                  callback: async () => {
                    if (!currentEntityId || availableEntities.length === 0) return;
                    const target = availableEntities[targetIdx];
                    if (!target) return;
                    const desc = String(
                      (await api.v1.storyStorage.get(STORAGE_KEYS.REL_FORM_DESC)) || "",
                    ).trim();
                    dispatch(
                      relationshipAdded({
                        relationship: {
                          id: api.v1.uuid(),
                          fromEntityId: currentEntityId,
                          toEntityId: target.id,
                          description: desc || "related to",
                        },
                      }),
                    );
                    hideRelForm();
                  },
                }),
                button({
                  id: IDS.LOREBOOK.REL_FORM_CANCEL_BTN,
                  text: "✕",
                  style: this.style?.("relFormAction"),
                  callback: () => hideRelForm(),
                }),
              ],
            }),

            // Reforge + Unbind buttons
            row({
              style: this.style?.("actionRow"),
              content: [
                button({
                  id: IDS.LOREBOOK.REFORGE_ENTITY_BTN,
                  text: "⟲ Reforge Entity",
                  style: this.style?.("actionBtn"),
                  callback: () => {
                    const state = getState();
                    const entryId = state.ui.lorebook.selectedEntryId;
                    if (!entryId) return;
                    const entity = state.world.entities.find(
                      (e) => e.lorebookEntryId === entryId,
                    );
                    if (entity) {
                      dispatch(entityReforgeRequested({ entityId: entity.id }));
                    }
                  },
                }),
                button({
                  id: IDS.LOREBOOK.UNBIND_BTN,
                  text: "✕ Unbind",
                  style: this.style?.("unbindBtn"),
                  callback: () => {
                    const state = getState();
                    const entryId = state.ui.lorebook.selectedEntryId;
                    if (!entryId) return;
                    const entity = state.world.entities.find(
                      (e) => e.lorebookEntryId === entryId,
                    );
                    if (entity) {
                      dispatch(entityUnbound({ entityId: entity.id }));
                      api.v1.ui.toast(`Unbound: ${entity.name}`, { type: "success" });
                    }
                  },
                }),
              ],
            }),
          ],
        }),
      ],
    });
  },
});
