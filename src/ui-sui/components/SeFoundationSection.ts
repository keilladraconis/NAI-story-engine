/**
 * SeFoundationSection — SUI replacement for Foundation/NarrativeFoundation.ts
 *
 * Collapsible section containing:
 *   Shape  — textInput (name) + SeEditableText (description) + SeGenerationButton
 *   Intent — SeEditableText + SeGenerationButton
 *   ATTG   — multilineTextInput (storageKey) + SeGenerationButton + "Copy to Memory" checkbox
 *   Style  — multilineTextInput (storageKey) + SeGenerationButton + "Copy to Author's Note" checkbox
 *
 * SeEditableText instances and SeGenerationButton instances are persistent
 * (created in the constructor). Reactive view updates are handled by:
 *   - SeEditableText liveSelector  → updateParts on view text
 *   - SeGenerationButton watcher   → updateParts on button mode
 *
 * No structural changes in this section, so no rebuild machinery needed.
 */

import { SuiComponent, type SuiComponentOptions } from "nai-simple-ui";
import { store } from "../../core/store";
import {
  shapeUpdated,
  intentUpdated,
  attgUpdated,
  styleUpdated,
  shapeGenerationRequested,
  intentGenerationRequested,
  attgGenerationRequested,
  styleGenerationRequested,
} from "../../core/store/slices/foundation";
import { STORAGE_KEYS } from "../../ui/framework/ids";
import { attgForMemory } from "../../core/utils/filters";
import { SeGenerationButton } from "./SeGenerationButton";
import { SeEditableText } from "./SeEditableText";

type SeFoundationSectionTheme = { default: { self: { style: object } } };
type SeFoundationSectionState = Record<string, never>;

export type SeFoundationSectionOptions =
  SuiComponentOptions<SeFoundationSectionTheme, SeFoundationSectionState>;

// ── Foundation IDs (local constants, avoid importing IDS to keep component self-contained) ──

const FN = {
  SECTION:       "se-fn-section",
  SHAPE_NAME:    "se-fn-shape-name",
  SHAPE_TEXT:    "se-fn-shape",
  SHAPE_BTN:     "se-fn-shape-btn",
  INTENT_TEXT:   "se-fn-intent",
  INTENT_BTN:    "se-fn-intent-btn",
  ATTG_INPUT:    "se-fn-attg",
  ATTG_GEN_BTN:  "se-fn-attg-gen",
  STYLE_INPUT:   "se-fn-style",
  STYLE_GEN_BTN: "se-fn-style-gen",
} as const;

// Escape for markdown display (SeEditableText applies this automatically when
// formatDisplay is provided — we define it here so liveSelector updates escape too).
const escapeDisplay = (raw: string): string =>
  raw.replace(/\n/g, "  \n").replace(/</g, "\\<");

// ── Helpers to build stateProjection for foundation gen buttons ──────────────

function foundationProjection(targetId: "shape" | "intent" | "attg" | "style") {
  return (s: ReturnType<typeof store.getState>) => {
    const queued = s.runtime.queue.find(r => r.type === "foundation" && r.targetId === targetId);
    const active = s.runtime.activeRequest?.type === "foundation" && s.runtime.activeRequest.targetId === targetId
      ? s.runtime.activeRequest
      : null;
    return queued?.id ?? active?.id;
  };
}

// ── SeFoundationSection ───────────────────────────────────────────────────────

export class SeFoundationSection extends SuiComponent<
  SeFoundationSectionTheme,
  SeFoundationSectionState,
  SeFoundationSectionOptions,
  UIPartCollapsibleSection
> {
  private readonly _shapeBtnGen:  SeGenerationButton;
  private readonly _intentBtnGen: SeGenerationButton;
  private readonly _attgBtnGen:   SeGenerationButton;
  private readonly _styleBtnGen:  SeGenerationButton;
  private readonly _shapeEditable:  SeEditableText;
  private readonly _intentEditable: SeEditableText;

  constructor(options: SeFoundationSectionOptions) {
    super(
      { state: {} as SeFoundationSectionState, ...options },
      { default: { self: { style: {} } } },
    );

    this._shapeBtnGen = new SeGenerationButton({
      id:                      FN.SHAPE_BTN,
      label:                   "Generate",
      onGenerate:              () => { store.dispatch(shapeGenerationRequested()); },
      stateProjection:         foundationProjection("shape"),
      requestIdFromProjection: (p) => p as string | undefined,
    });

    this._intentBtnGen = new SeGenerationButton({
      id:                      FN.INTENT_BTN,
      label:                   "Generate",
      onGenerate:              () => { store.dispatch(intentGenerationRequested()); },
      stateProjection:         foundationProjection("intent"),
      requestIdFromProjection: (p) => p as string | undefined,
    });

    this._attgBtnGen = new SeGenerationButton({
      id:                      FN.ATTG_GEN_BTN,
      label:                   "Generate",
      onGenerate:              () => { store.dispatch(attgGenerationRequested()); },
      stateProjection:         foundationProjection("attg"),
      requestIdFromProjection: (p) => p as string | undefined,
    });

    this._styleBtnGen = new SeGenerationButton({
      id:                      FN.STYLE_GEN_BTN,
      label:                   "Generate",
      onGenerate:              () => { store.dispatch(styleGenerationRequested()); },
      stateProjection:         foundationProjection("style"),
      requestIdFromProjection: (p) => p as string | undefined,
    });

    this._shapeEditable = new SeEditableText({
      id:            FN.SHAPE_TEXT,
      getContent:    () => store.getState().foundation.shape?.description ?? "",
      placeholder:   "Generate or describe the shape — what structural moments this story leans toward.",
      formatDisplay: escapeDisplay,
      liveSelector:  (s) => s.foundation.shape?.description ?? "",
      onSave:        async (content: string) => {
        const nameRaw = await api.v1.storyStorage.get(STORAGE_KEYS.FOUNDATION_SHAPE_NAME_UI);
        const name    = String(nameRaw || "").trim();
        store.dispatch(shapeUpdated({ shape: content ? { name, description: content } : null }));
      },
    });

    this._intentEditable = new SeEditableText({
      id:            FN.INTENT_TEXT,
      label:         "Intent",
      getContent:    () => store.getState().foundation.intent,
      placeholder:   "What is this story about? What do you want to explore?",
      formatDisplay: escapeDisplay,
      liveSelector:  (s) => s.foundation.intent,
      onSave:        (content: string) => {
        store.dispatch(intentUpdated({ intent: content }));
      },
    });
  }

  async compose(): Promise<UIPartCollapsibleSection> {
    const [shapeBtnPart, intentBtnPart, attgBtnPart, styleBtnPart] = await Promise.all([
      this._shapeBtnGen.build(),
      this._intentBtnGen.build(),
      this._attgBtnGen.build(),
      this._styleBtnGen.build(),
    ]);

    const [shapeEditablePart, intentEditablePart] = await Promise.all([
      this._shapeEditable.build(),
      this._intentEditable.build(),
    ]);

    const { column, row, text, textInput, multilineTextInput, checkboxInput, collapsibleSection } = api.v1.ui.part;

    const LABEL_STYLE  = { "font-size": "0.8em", "font-weight": "bold", opacity: "0.7", "margin-bottom": "2px" } as const;
    const TEXTAREA_STYLE = { "min-height": "60px", "font-size": "0.85em" } as const;
    const CHECKBOX_ROW_STYLE = { "margin-top": "4px", gap: "8px" } as const;

    // ── Shape ──────────────────────────────────────────────────────────────
    const shapeLabel     = text({ text: "**Shape**", markdown: true, style: LABEL_STYLE });
    const shapeNameInput = textInput({
      id:          FN.SHAPE_NAME,
      storageKey:  `story:${STORAGE_KEYS.FOUNDATION_SHAPE_NAME_UI}`,
      label:       "",
      placeholder: "e.g. Slice of Life, Tragedy, Heist… (leave blank to invent)",
    });
    // We need to re-build shapeEditable with the gen button ... Actually extraControls
    // is set at construction time. Let me reconsider — we pass it there.
    // (See constructor: _shapeEditable doesn't have extraControls yet — fix below)

    // ── Intent ─────────────────────────────────────────────────────────────
    // (intentEditable already configured in constructor)

    // ── ATTG ───────────────────────────────────────────────────────────────
    const attgInput = multilineTextInput({
      id:          FN.ATTG_INPUT,
      placeholder: "Author's thought-to-generation notes...",
      initialValue: "",
      storageKey:  `story:${STORAGE_KEYS.FOUNDATION_ATTG_UI}`,
      style:       TEXTAREA_STYLE,
      onChange:    async (value: string) => {
        store.dispatch(attgUpdated({ attg: value }));
        const syncEnabled = await api.v1.storyStorage.get(STORAGE_KEYS.SYNC_ATTG_MEMORY);
        if (syncEnabled) await api.v1.memory.set(await attgForMemory(value));
      },
    });

    const attgCheckbox = checkboxInput({
      id:           "se-fn-attg-sync-checkbox",
      initialValue: false,
      storageKey:   `story:${STORAGE_KEYS.SYNC_ATTG_MEMORY_UI}`,
      label:        "Copy to Memory",
      onChange:     async (checked: boolean) => {
        if (checked) {
          const value = String((await api.v1.storyStorage.get(STORAGE_KEYS.FOUNDATION_ATTG_UI)) || "");
          await api.v1.memory.set(await attgForMemory(value));
        }
      },
    });

    // ── Style ──────────────────────────────────────────────────────────────
    const styleInput = multilineTextInput({
      id:           FN.STYLE_INPUT,
      placeholder:  "Writing style, tone, prose directives...",
      initialValue: "",
      storageKey:   `story:${STORAGE_KEYS.FOUNDATION_STYLE_UI}`,
      style:        TEXTAREA_STYLE,
      onChange:     async (value: string) => {
        store.dispatch(styleUpdated({ style: value }));
        const syncEnabled = await api.v1.storyStorage.get(STORAGE_KEYS.SYNC_STYLE_AN);
        if (syncEnabled) await api.v1.an.set(value);
      },
    });

    const styleCheckbox = checkboxInput({
      id:           "se-fn-style-sync-checkbox",
      initialValue: false,
      storageKey:   `story:${STORAGE_KEYS.SYNC_STYLE_AN_UI}`,
      label:        "Copy to Author's Note",
      onChange:     async (checked: boolean) => {
        if (checked) {
          const value = String((await api.v1.storyStorage.get(STORAGE_KEYS.FOUNDATION_STYLE_UI)) || "");
          await api.v1.an.set(value);
        }
      },
    });

    return collapsibleSection({
      id:         this.id,
      title:      "Narrative Foundation",
      storageKey: `story:${STORAGE_KEYS.FOUNDATION_SECTION_UI}`,
      content: [
        column({
          style: { gap: "8px" },
          content: [
            // Shape
            column({
              style: { gap: "4px" },
              content: [
                shapeLabel,
                shapeNameInput,
                row({ style: { gap: "4px", "align-items": "flex-end" }, content: [shapeEditablePart, shapeBtnPart] }),
              ],
            }),
            // Intent
            row({ style: { gap: "4px", "align-items": "flex-end" }, content: [intentEditablePart, intentBtnPart] }),
            // ATTG
            column({
              style: { gap: "4px" },
              content: [
                row({
                  style:   { "align-items": "center", "justify-content": "space-between" },
                  content: [text({ text: "**ATTG**", markdown: true, style: LABEL_STYLE }), attgBtnPart],
                }),
                attgInput,
                row({ style: CHECKBOX_ROW_STYLE, content: [attgCheckbox] }),
              ],
            }),
            // Style
            column({
              style: { gap: "4px" },
              content: [
                row({
                  style:   { "align-items": "center", "justify-content": "space-between" },
                  content: [text({ text: "**Style**", markdown: true, style: LABEL_STYLE }), styleBtnPart],
                }),
                styleInput,
                row({ style: CHECKBOX_ROW_STYLE, content: [styleCheckbox] }),
              ],
            }),
          ],
        }),
      ],
    });
  }
}
