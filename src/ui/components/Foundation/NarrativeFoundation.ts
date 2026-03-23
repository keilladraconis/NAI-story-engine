import { defineComponent } from "nai-act";
import { RootState, Tension } from "../../../core/store/types";
import {
  shapeUpdated,
  intentUpdated,
  worldStateUpdated,
  tensionAdded,
  attgUpdated,
  styleUpdated,
  shapeGenerationRequested,
  intentGenerationRequested,
  worldStateGenerationRequested,
  attgGenerationRequested,
  styleGenerationRequested,
} from "../../../core/store/slices/foundation";
import { IDS, STORAGE_KEYS } from "../../framework/ids";
import { GenerationButton } from "../GenerationButton";
import { EditableText } from "../EditableText";
import { TensionRow } from "./TensionRow";
import { escapeForMarkdown } from "../../utils";
import { attgForMemory } from "../../../core/utils/filters";

const { column, row, text, button, collapsibleSection, multilineTextInput, checkboxInput, textInput } = api.v1.ui.part;

const FN = IDS.FOUNDATION;

export const NarrativeFoundation = defineComponent<undefined, RootState>({
  id: () => FN.SECTION,

  styles: {
    label: { "font-size": "0.8em", "font-weight": "bold", opacity: "0.7", "margin-bottom": "2px" },
    resolvedLabel: { "font-size": "0.75em", opacity: "0.5", "font-style": "italic", display: "none" },
    resolvedLabelVisible: { "font-size": "0.75em", opacity: "0.5", "font-style": "italic" },
    addTensionBtn: { "font-size": "0.85em", width: "100%", "margin-top": "4px" },
    checkboxRow: { "margin-top": "4px", gap: "8px" },
    syncTextArea: { "min-height": "60px", "font-size": "0.85em" },
  },

  build(_props, ctx) {
    const { dispatch, useSelector } = ctx;
    const state = ctx.getState();

    // ── Shape ──────────────────────────────────────────────────────────────
    const shapeLabel = text({ text: "**Shape**", markdown: true, style: this.style?.("label") });

    const shapeNameInput = textInput({
      id: FN.SHAPE_NAME,
      storageKey: `story:${STORAGE_KEYS.FOUNDATION_SHAPE_NAME_UI}`,
      label: "",
      placeholder: "e.g. Slice of Life, Tragedy, Heist… (leave blank to invent)",
    });

    const { part: shapeBtnPart } = ctx.render(GenerationButton, {
      id: FN.SHAPE_BTN,
      label: "Generate",
      onGenerate: () => dispatch(shapeGenerationRequested()),
      stateProjection: (s) => {
        const queued = s.runtime.queue.find((r) => r.type === "foundation" && r.targetId === "shape");
        const active = s.runtime.activeRequest?.type === "foundation" && s.runtime.activeRequest.targetId === "shape"
          ? s.runtime.activeRequest : null;
        return queued?.id ?? active?.id;
      },
      requestIdFromProjection: (id: string | undefined) => id,
    });

    const { part: shapeEditablePart } = ctx.render(EditableText, {
      id: FN.SHAPE_TEXT,
      getContent: () => ctx.getState().foundation.shape?.description ?? "",
      placeholder: "Generate or describe the shape — what structural moments this story leans toward.",
      label: "",
      extraControls: [shapeBtnPart],
      initialDisplay: state.foundation.shape?.description
        ? escapeForMarkdown(state.foundation.shape.description)
        : undefined,
      onSave: async (content: string) => {
        const nameRaw = await api.v1.storyStorage.get(STORAGE_KEYS.FOUNDATION_SHAPE_NAME_UI);
        const name = String(nameRaw || "").trim();
        dispatch(shapeUpdated({ shape: content ? { name, description: content } : null }));
      },
    });

    // Sync description view when state changes (e.g. after generation)
    ctx.bindPart(
      `${FN.SHAPE_TEXT}-view`,
      (s) => s.foundation.shape?.description,
      (description) => ({ text: description ? escapeForMarkdown(description) : "" }),
    );

    // ── Intent ─────────────────────────────────────────────────────────────
    const { part: intentBtnPart } = ctx.render(GenerationButton, {
      id: FN.INTENT_BTN,
      label: "Generate",
      onGenerate: () => dispatch(intentGenerationRequested()),
      stateProjection: (s) => {
        const queued = s.runtime.queue.find((r) => r.type === "foundation" && r.targetId === "intent");
        const active = s.runtime.activeRequest?.type === "foundation" && s.runtime.activeRequest.targetId === "intent"
          ? s.runtime.activeRequest : null;
        return queued?.id ?? active?.id;
      },
      requestIdFromProjection: (id: string | undefined) => id,
    });

    const { part: intentEditablePart } = ctx.render(EditableText, {
      id: FN.INTENT_TEXT,
      getContent: () => ctx.getState().foundation.intent,
      placeholder: "What is this story about? What do you want to explore?",
      label: "Intent",
      extraControls: [intentBtnPart],
      initialDisplay: state.foundation.intent ? escapeForMarkdown(state.foundation.intent) : undefined,
      onSave: (content: string) => dispatch(intentUpdated({ intent: content })),
    });

    ctx.bindPart(
      `${FN.INTENT_TEXT}-view`,
      (s) => s.foundation.intent,
      (intent) => ({ text: intent ? escapeForMarkdown(intent) : "" }),
    );

    // ── World State ────────────────────────────────────────────────────────
    const { part: worldStateBtnPart } = ctx.render(GenerationButton, {
      id: FN.WORLD_STATE_BTN,
      label: "Generate",
      onGenerate: () => dispatch(worldStateGenerationRequested()),
      stateProjection: (s) => {
        const queued = s.runtime.queue.find((r) => r.type === "foundation" && r.targetId === "worldState");
        const active = s.runtime.activeRequest?.type === "foundation" && s.runtime.activeRequest.targetId === "worldState"
          ? s.runtime.activeRequest : null;
        return queued?.id ?? active?.id;
      },
      requestIdFromProjection: (id: string | undefined) => id,
    });

    const { part: worldStateEditablePart } = ctx.render(EditableText, {
      id: FN.WORLD_STATE_TEXT,
      getContent: () => ctx.getState().foundation.worldState,
      placeholder: "The current state of the world — ongoing conflicts, factions, mood...",
      label: "World State",
      extraControls: [worldStateBtnPart],
      initialDisplay: state.foundation.worldState ? escapeForMarkdown(state.foundation.worldState) : undefined,
      onSave: (content: string) => dispatch(worldStateUpdated({ worldState: content })),
    });

    ctx.bindPart(
      `${FN.WORLD_STATE_TEXT}-view`,
      (s) => s.foundation.worldState,
      (ws) => ({ text: ws ? escapeForMarkdown(ws) : "" }),
    );

    // ── Tensions ───────────────────────────────────────────────────────────
    const resolvedCount = state.foundation.tensions.filter((t) => t.resolved).length;

    // Show/hide resolved section header based on resolved count
    useSelector(
      (s) => s.foundation.tensions.filter((t) => t.resolved).length,
      (count) => {
        api.v1.ui.updateParts([
          {
            id: `${FN.TENSIONS_LIST}-resolved-header`,
            style: count > 0 ? this.style?.("resolvedLabelVisible") : this.style?.("resolvedLabel"),
          },
        ]);
      },
    );

    const addTensionBtn = button({
      id: FN.ADD_TENSION_BTN,
      text: "⚡ Add Tension",
      style: this.style?.("addTensionBtn"),
      callback: () => {
        dispatch(tensionAdded({ tension: { id: api.v1.uuid(), text: "", resolved: false } }));
      },
    });

    const tensionsSection = column({
      style: { gap: "4px" },
      content: [
        text({ text: "**Tensions**", markdown: true, style: this.style?.("label") }),
        column({
          id: FN.TENSIONS_LIST,
          style: { gap: "4px" },
          content: ctx.bindList(
            FN.TENSIONS_LIST,
            (s) => s.foundation.tensions.filter((t) => !t.resolved),
            (t: Tension) => t.id,
            (t: Tension) => ({
              component: TensionRow,
              props: { tensionId: t.id, initialText: t.text, resolved: false },
            }),
          ),
        }),
        text({
          id: `${FN.TENSIONS_LIST}-resolved-header`,
          text: "— resolved —",
          style: resolvedCount > 0 ? this.style?.("resolvedLabelVisible") : this.style?.("resolvedLabel"),
        }),
        column({
          id: `${FN.TENSIONS_LIST}-resolved`,
          style: { gap: "4px" },
          content: ctx.bindList(
            `${FN.TENSIONS_LIST}-resolved`,
            (s) => s.foundation.tensions.filter((t) => t.resolved),
            (t: Tension) => t.id,
            (t: Tension) => ({
              component: TensionRow,
              props: { tensionId: t.id, initialText: t.text, resolved: true },
            }),
          ),
        }),
        addTensionBtn,
      ],
    });

    // ── ATTG ───────────────────────────────────────────────────────────────
    const { part: attgBtnPart } = ctx.render(GenerationButton, {
      id: FN.ATTG_GEN_BTN,
      label: "Generate",
      onGenerate: () => dispatch(attgGenerationRequested()),
      stateProjection: (s) => {
        const queued = s.runtime.queue.find((r) => r.type === "foundation" && r.targetId === "attg");
        const active = s.runtime.activeRequest?.type === "foundation" && s.runtime.activeRequest.targetId === "attg"
          ? s.runtime.activeRequest : null;
        return queued?.id ?? active?.id;
      },
      requestIdFromProjection: (id: string | undefined) => id,
    });

    const attgInput = multilineTextInput({
      id: FN.ATTG_INPUT,
      placeholder: "Author's thought-to-generation notes...",
      initialValue: "",
      storageKey: `story:${STORAGE_KEYS.FOUNDATION_ATTG_UI}`,
      style: this.style?.("syncTextArea"),
      onChange: async (value: string) => {
        dispatch(attgUpdated({ attg: value }));
        const syncEnabled = await api.v1.storyStorage.get(STORAGE_KEYS.SYNC_ATTG_MEMORY);
        if (syncEnabled) {
          await api.v1.memory.set(await attgForMemory(value));
        }
      },
    });

    const attgCheckbox = checkboxInput({
      id: "se-fn-attg-sync-checkbox",
      initialValue: false,
      storageKey: `story:${STORAGE_KEYS.SYNC_ATTG_MEMORY_UI}`,
      label: "Copy to Memory",
      onChange: async (checked: boolean) => {
        if (checked) {
          const value = String((await api.v1.storyStorage.get(STORAGE_KEYS.FOUNDATION_ATTG_UI)) || "");
          await api.v1.memory.set(await attgForMemory(value));
        }
      },
    });

    // ── Style ──────────────────────────────────────────────────────────────
    const { part: styleBtnPart } = ctx.render(GenerationButton, {
      id: FN.STYLE_GEN_BTN,
      label: "Generate",
      onGenerate: () => dispatch(styleGenerationRequested()),
      stateProjection: (s) => {
        const queued = s.runtime.queue.find((r) => r.type === "foundation" && r.targetId === "style");
        const active = s.runtime.activeRequest?.type === "foundation" && s.runtime.activeRequest.targetId === "style"
          ? s.runtime.activeRequest : null;
        return queued?.id ?? active?.id;
      },
      requestIdFromProjection: (id: string | undefined) => id,
    });

    const styleInput = multilineTextInput({
      id: FN.STYLE_INPUT,
      placeholder: "Writing style, tone, prose directives...",
      initialValue: "",
      storageKey: `story:${STORAGE_KEYS.FOUNDATION_STYLE_UI}`,
      style: this.style?.("syncTextArea"),
      onChange: async (value: string) => {
        dispatch(styleUpdated({ style: value }));
        const syncEnabled = await api.v1.storyStorage.get(STORAGE_KEYS.SYNC_STYLE_AN);
        if (syncEnabled) {
          await api.v1.an.set(value);
        }
      },
    });

    const styleCheckbox = checkboxInput({
      id: "se-fn-style-sync-checkbox",
      initialValue: false,
      storageKey: `story:${STORAGE_KEYS.SYNC_STYLE_AN_UI}`,
      label: "Copy to Author's Note",
      onChange: async (checked: boolean) => {
        if (checked) {
          const value = String((await api.v1.storyStorage.get(STORAGE_KEYS.FOUNDATION_STYLE_UI)) || "");
          await api.v1.an.set(value);
        }
      },
    });

    return collapsibleSection({
      id: FN.SECTION,
      title: "Narrative Foundation",
      storageKey: `story:${STORAGE_KEYS.FOUNDATION_SECTION_UI}`,
      content: [
        column({
          style: { gap: "8px" },
          content: [
            shapeLabel,
            shapeNameInput,
            shapeEditablePart,
            intentEditablePart,
            worldStateEditablePart,
            tensionsSection,
            column({
              style: { gap: "4px" },
              content: [
                row({
                  style: { "align-items": "center", "justify-content": "space-between" },
                  content: [
                    text({ text: "**ATTG**", markdown: true, style: this.style?.("label") }),
                    attgBtnPart,
                  ],
                }),
                attgInput,
                row({ style: this.style?.("checkboxRow"), content: [attgCheckbox] }),
              ],
            }),
            column({
              style: { gap: "4px" },
              content: [
                row({
                  style: { "align-items": "center", "justify-content": "space-between" },
                  content: [
                    text({ text: "**Style**", markdown: true, style: this.style?.("label") }),
                    styleBtnPart,
                  ],
                }),
                styleInput,
                row({ style: this.style?.("checkboxRow"), content: [styleCheckbox] }),
              ],
            }),
          ],
        }),
      ],
    });
  },
});
