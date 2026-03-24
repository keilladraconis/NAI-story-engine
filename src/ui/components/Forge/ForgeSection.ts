import { defineComponent } from "nai-act";
import { RootState, WorldEntity } from "../../../core/store/types";
import {
  forgeRequested,
  castAllRequested,
  discardAllRequested,
} from "../../../core/store/slices/world";
import { IDS, STORAGE_KEYS } from "../../framework/ids";
import { GenerationButton } from "../GenerationButton";
import { ForgeEntityRow } from "./ForgeEntityRow";

const { column, row, text, button, collapsibleSection, multilineTextInput, textInput } = api.v1.ui.part;

const FG = IDS.FORGE;

export const ForgeSection = defineComponent<undefined, RootState>({
  id: () => FG.SECTION,

  styles: {
    intentInput: { "min-height": "60px", "font-size": "0.85em" },
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

    // ── Forge intent ───────────────────────────────────────────────────────
    const intentInput = multilineTextInput({
      id: FG.INTENT_INPUT,
      placeholder: "What should I forge next? Leave blank to forge from Brainstorm...",
      initialValue: "",
      storageKey: `story:${STORAGE_KEYS.FORGE_INTENT_UI}`,
      style: this.style?.("intentInput"),
    });

    // ── Forge button ───────────────────────────────────────────────────────
    // stateProjection surfaces the active forge request ID so GenerationButton
    // can show its cancel control. When looping between steps (no active request),
    // isDisabledFromProjection keeps the button disabled without a cancel.
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
      placeholder: "Batch name (auto-generated)...",
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
        (e: WorldEntity) => ({ component: ForgeEntityRow, props: { entityId: e.id } }),
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
          text: "⚡ Cast All",
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
