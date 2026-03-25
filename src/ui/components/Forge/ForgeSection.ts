import { defineComponent } from "nai-act";
import { RootState, WorldEntity } from "../../../core/store/types";
import {
  forgeRequested,
  forgeClearRequested,
  castAllRequested,
  discardAllRequested,
} from "../../../core/store/slices/world";
import { IDS, STORAGE_KEYS } from "../../framework/ids";
import { GenerationButton } from "../GenerationButton";
import { ButtonWithConfirmation } from "../ButtonWithConfirmation";
import { EntityCard } from "../EntityCard";

const { column, row, text, button, collapsibleSection, multilineTextInput, textInput } = api.v1.ui.part;

const FG = IDS.FORGE;

export const ForgeSection = defineComponent<undefined, RootState>({
  id: () => FG.SECTION,

  styles: {
    intentInput: { "min-height": "5em", "font-size": "0.85em" },
    batchNameInput: { "font-size": "0.85em" },
    actionBtn: { flex: "1", "font-size": "0.85em" },
    separator: { "border-top": "1px solid rgba(128,128,128,0.2)", margin: "6px 0" },
    castDiscardRow: { gap: "4px", "margin-top": "4px" },
    castDiscardHidden: { gap: "4px", "margin-top": "4px", display: "none" },
  },

  build(_props, ctx) {
    const { dispatch, useSelector } = ctx;
    const state = ctx.getState();
    const hasDraftEntities = state.world.entities.some((e) => e.lifecycle === "draft");

    // ── Clear Forge (tucked upper-right) ───────────────────────────────────
    const { part: clearBtnPart } = ctx.render(ButtonWithConfirmation, {
      id: FG.CLEAR_BTN,
      label: "Clear",
      confirmLabel: "Clear forge?",
      buttonStyle: { "font-size": "0.75em", opacity: "0.5", padding: "2px 8px" },
      onConfirm: () => dispatch(forgeClearRequested()),
    });

    // ── Forge intent ───────────────────────────────────────────────────────
    const intentInput = multilineTextInput({
      id: FG.GUIDANCE_INPUT,
      placeholder: "What should the Forge build? Leave blank to draw from your Brainstorm conversation.",
      initialValue: "",
      storageKey: `story:${STORAGE_KEYS.FORGE_GUIDANCE_UI}`,
      style: this.style?.("intentInput"),
    });

    // ── Forge button ───────────────────────────────────────────────────────
    const { part: forgeBtnPart } = ctx.render(GenerationButton, {
      id: FG.FORGE_BTN,
      label: "Forge",
      onGenerate: () => dispatch(forgeRequested()),
      stateProjection: (s: RootState) => ({
        loopActive: s.world.forgeLoopActive,
        activeForgeId: s.runtime.activeRequest?.type === "forge"
          ? s.runtime.activeRequest.id
          : undefined,
      }),
      requestIdFromProjection: (p: { loopActive: boolean; activeForgeId?: string }) => p.activeForgeId,
      isDisabledFromProjection: (p: { loopActive: boolean; activeForgeId?: string }) =>
        p.loopActive && !p.activeForgeId,
    });

    // ── Ticker (streaming output) ──────────────────────────────────────────
    const ticker = text({
      id: FG.TICKER,
      text: "",
      style: { "font-size": "0.75em", opacity: "0.5", "font-style": "italic", "min-height": "1em" },
    });

    // ── Batch name ─────────────────────────────────────────────────────────
    const batchNameInput = textInput({
      id: FG.BATCH_NAME,
      placeholder: "Batch name (auto-named from intent)...",
      initialValue: "",
      storageKey: `story:${STORAGE_KEYS.FORGE_BATCH_NAME_UI}`,
      style: this.style?.("batchNameInput"),
    });

    // ── Draft entity list ──────────────────────────────────────────────────
    const entityList = column({
      id: FG.ENTITY_LIST,
      style: { gap: "2px" },
      content: ctx.bindList(
        FG.ENTITY_LIST,
        (s) => s.world.entities.filter((e) => e.lifecycle === "draft"),
        (e: WorldEntity) => e.id,
        (e: WorldEntity) => ({
          component: EntityCard,
          props: { entityId: e.id, lifecycle: "draft" as const },
        }),
      ),
    });

    // ── Cast All / Discard All (shown only when draft entities exist) ───────
    useSelector(
      (s) => s.world.entities.some((e) => e.lifecycle === "draft"),
      (hasDraft) => {
        api.v1.ui.updateParts([
          { id: FG.CAST_DISCARD_ROW, style: hasDraft ? this.style?.("castDiscardRow") : this.style?.("castDiscardHidden") },
        ]);
      },
    );

    const castDiscardRow = row({
      id: FG.CAST_DISCARD_ROW,
      style: hasDraftEntities ? this.style?.("castDiscardRow") : this.style?.("castDiscardHidden"),
      content: [
        button({
          id: FG.CAST_ALL_BTN,
          text: "→ Cast All",
          style: this.style?.("actionBtn"),
          callback: () => dispatch(castAllRequested()),
        }),
        button({
          id: FG.DISCARD_ALL_BTN,
          text: "✕ Discard All",
          style: this.style?.("actionBtn"),
          callback: () => dispatch(discardAllRequested()),
        }),
      ],
    });

    return collapsibleSection({
      id: FG.SECTION,
      title: "Forge",
      storageKey: `story:${STORAGE_KEYS.FORGE_SECTION_UI}`,
      content: [
        column({
          style: { gap: "6px" },
          content: [
            row({ style: { "justify-content": "flex-end" }, content: [clearBtnPart] }),
            intentInput,
            forgeBtnPart,
            ticker,
            text({ style: this.style?.("separator") }),
            batchNameInput,
            entityList,
            castDiscardRow,
          ],
        }),
      ],
    });
  },
});
