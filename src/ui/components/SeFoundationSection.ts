/**
 * SeFoundationSection — SUI replacement for Foundation/NarrativeFoundation.ts
 *
 * Collapsible section containing:
 *   Shape  — SuiCard (name label + description text) + edit/generate actions
 *   Intent — SuiCard (label + content text) + edit/generate actions
 *   ATTG   — SuiCard (label + content text) + edit/generate/sync-toggle actions
 *   Style  — SuiCard (label + content text) + edit/generate/sync-toggle actions
 *
 * Shape editing opens a ContentWithTitle edit pane.
 * Intent/ATTG/Style editing opens a SimpleContent edit pane.
 * ATTG/Style have a SuiToggle (radio icon) for syncing to Memory.
 */

import {
  SuiComponent,
  SuiCard,
  SuiButton,
  SuiActionBar,
  SuiToggle,
  type SuiComponentOptions,
} from "nai-simple-ui";
import { store } from "../../core/store";
import {
  shapeUpdated,
  intentUpdated,
  intensityUpdated,
  contractUpdated,
  attgUpdated,
  styleUpdated,
  attgSyncToggled,
  styleSyncToggled,
  shapeGenerationRequested,
  intentGenerationRequested,
  contractGenerationRequested,
  attgGenerationRequested,
  styleGenerationRequested,
} from "../../core/store/slices/foundation";
import { IDS } from "../framework/ids";
import { StoreWatcher } from "../store-watcher";
import { SeGenerationIconButton } from "./SeGenerationButton";
import { SeGenRefinePair } from "./SeGenRefinePair";
import {
  SeContentWithTitlePane,
  type EditPaneHost,
} from "./SeContentWithTitlePane";
import { SeSimpleContentPane } from "./SeSimpleContentPane";

type SeFoundationSectionTheme = { default: { self: { style: object } } };
type SeFoundationSectionState = Record<string, never>;

export type SeFoundationSectionOptions = {
  editHost: EditPaneHost;
} & SuiComponentOptions<SeFoundationSectionTheme, SeFoundationSectionState>;

// ── IDs ─────────────────────────────────────────────────────────────────────

const FN = {
  SECTION: "se-fn-section",
  SHAPE_CARD: "se-fn-shape-card",
  SHAPE_EDIT: "se-fn-shape-edit",
  SHAPE_BTN: "se-fn-shape-btn",
  INTENT_CARD: "se-fn-intent-card",
  INTENT_EDIT: "se-fn-intent-edit",
  INTENT_BTN: "se-fn-intent-btn",
  INTENSITY_CARD: "se-fn-intensity-card",
  CONTRACT_CARD: "se-fn-contract-card",
  CONTRACT_EDIT: "se-fn-contract-edit",
  CONTRACT_BTN: "se-fn-contract-btn",
  ATTG_CARD: "se-fn-attg-card",
  ATTG_EDIT: "se-fn-attg-edit",
  ATTG_BTN: "se-fn-attg-btn",
  ATTG_SYNC: "se-fn-attg-sync",
  STYLE_CARD: "se-fn-style-card",
  STYLE_EDIT: "se-fn-style-edit",
  STYLE_BTN: "se-fn-style-btn",
  STYLE_SYNC: "se-fn-style-sync",
} as const;

const escapeDisplay = (raw: string): string =>
  raw.replace(/\n/g, "  \n").replace(/</g, "\\<");

// ── Helpers ─────────────────────────────────────────────────────────────────

function foundationProjection(targetId: "shape" | "intent" | "contract" | "attg" | "style") {
  return (s: ReturnType<typeof store.getState>) => {
    const queued = s.runtime.queue.find(
      (r) => r.type === "foundation" && r.targetId === targetId,
    );
    const active =
      s.runtime.activeRequest?.type === "foundation" &&
      s.runtime.activeRequest.targetId === targetId
        ? s.runtime.activeRequest
        : null;
    return queued?.id ?? active?.id;
  };
}

// ── Theme overrides for cards ───────────────────────────────────────────────

const CARD_THEME = {
  default: {
    self: { style: {} },
    label: {
      style: {
        fontWeight: "bold",
        fontSize: "0.85em",
        padding: "2px 0",
        cursor: "pointer",
      },
    },
    actions: {
      style: { gap: "2px" },
      base: { padding: "2px", background: "none", opacity: "1" },
    },
  },
} as const;

const CONTENT_TEXT_STYLE = {
  "font-size": "0.85em",
  opacity: "0.85",
  "white-space": "pre-wrap",
  "word-break": "break-word",
  "user-select": "text",
  padding: "0 0 4px",
} as const;

// ── Intensity levels ────────────────────────────────────────────────────────

const INTENSITY_LEVELS = [
  { level: "Cozy",      description: "Safe, warm, low stakes — threats are social or emotional, no one is in real danger." },
  { level: "Grounded",  description: "Real-world friction and consequences; setbacks matter but survival is assumed." },
  { level: "Gritty",    description: "Serious harm is possible; moral compromise is common; comfort is earned, not given." },
  { level: "Noir",      description: "No clean exits; moral corruption is systemic; characters pay real prices for their choices." },
  { level: "Nightmare", description: "High lethality, psychological extremity; no guaranteed safety for anyone." },
] as const;

const INTENSITY_BTN_BASE = {
  fontWeight: "normal",
  fontSize: "0.775rem",
  padding: "3px 8px",
  margin: "0",
  gap: "4px",
  border: "none",
};
const INTENSITY_STYLE_DEFAULT = { ...INTENSITY_BTN_BASE, opacity: "0.4", background: "none" };
const INTENSITY_STYLE_SELECTED = { ...INTENSITY_BTN_BASE, opacity: "1", background: "rgba(144, 238, 144, 0.15)", borderRadius: "3px" };

/** Toggle theme: toggle icon, grey off / green on. Matches simple-context entry cards. */
const SYNC_TOGGLE_THEME = {
  default: {
    self: {
      iconId: "toggle-left" as IconId,
      style: { padding: "2px", background: "none", opacity: "0.45" },
    },
  },
  on: {
    self: {
      iconId: "toggle-right" as IconId,
      style: { color: "rgb(87, 178, 96)", opacity: "1" },
    },
  },
} as const;

// ── SeFoundationSection ─────────────────────────────────────────────────────

export class SeFoundationSection extends SuiComponent<
  SeFoundationSectionTheme,
  SeFoundationSectionState,
  SeFoundationSectionOptions,
  UIPartCollapsibleSection
> {
  private readonly _watcher: StoreWatcher;
  private readonly _shapeEditBtn: SuiButton;
  private readonly _shapeBtnGen: SeGenerationIconButton;
  private readonly _intentEditBtn: SuiButton;
  private readonly _intentBtnGen: SeGenRefinePair;
  private readonly _contractEditBtn: SuiButton;
  private readonly _contractBtnGen: SeGenRefinePair;
  private readonly _attgEditBtn: SuiButton;
  private readonly _attgBtnGen: SeGenRefinePair;
  private readonly _attgSyncToggle: SuiToggle;
  private readonly _styleEditBtn: SuiButton;
  private readonly _styleBtnGen: SeGenRefinePair;
  private readonly _styleSyncToggle: SuiToggle;

  constructor(options: SeFoundationSectionOptions) {
    super(
      { state: {} as SeFoundationSectionState, ...options },
      { default: { self: { style: {} } } },
    );

    this._watcher = new StoreWatcher();

    this._shapeEditBtn = new SuiButton({
      id: FN.SHAPE_EDIT,
      callback: () => {
        this._openShapeEdit();
      },
      theme: { default: { self: { iconId: "edit" as IconId } } },
    });

    this._shapeBtnGen = new SeGenerationIconButton({
      id: FN.SHAPE_BTN,
      iconId: "zap" as IconId,
      onGenerate: () => {
        store.dispatch(shapeGenerationRequested());
      },
      stateProjection: foundationProjection("shape"),
      requestIdFromProjection: (p) => p as string | undefined,
    });

    this._intentEditBtn = new SuiButton({
      id: FN.INTENT_EDIT,
      callback: () => {
        this._openIntentEdit();
      },
      theme: { default: { self: { iconId: "edit" as IconId } } },
    });

    this._intentBtnGen = new SeGenRefinePair({
      id: FN.INTENT_BTN,
      fieldId: "intent",
      onGenerate: () => {
        store.dispatch(intentGenerationRequested());
      },
      refineSourceText: () => store.getState().foundation.intent ?? "",
      stateProjection: foundationProjection("intent"),
      requestIdFromProjection: (p) => p as string | undefined,
    });

    this._contractEditBtn = new SuiButton({
      id: FN.CONTRACT_EDIT,
      callback: () => {
        this._openContractEdit();
      },
      theme: { default: { self: { iconId: "edit" as IconId } } },
    });

    this._contractBtnGen = new SeGenRefinePair({
      id: FN.CONTRACT_BTN,
      fieldId: "contract",
      onGenerate: () => {
        store.dispatch(contractGenerationRequested());
      },
      refineSourceText: () => {
        const c = store.getState().foundation.contract;
        if (!c) return "";
        return `REQUIRED: ${c.required}\nPROHIBITED: ${c.prohibited}\nEMPHASIS: ${c.emphasis}`;
      },
      stateProjection: foundationProjection("contract"),
      requestIdFromProjection: (p) => p as string | undefined,
    });

    this._attgEditBtn = new SuiButton({
      id: FN.ATTG_EDIT,
      callback: () => {
        this._openAttgEdit();
      },
      theme: { default: { self: { iconId: "edit" as IconId } } },
    });

    this._attgBtnGen = new SeGenRefinePair({
      id: FN.ATTG_BTN,
      fieldId: "attg",
      onGenerate: () => {
        store.dispatch(attgGenerationRequested());
      },
      refineSourceText: () => store.getState().foundation.attg ?? "",
      stateProjection: foundationProjection("attg"),
      requestIdFromProjection: (p) => p as string | undefined,
    });

    this._attgSyncToggle = new SuiToggle({
      id: FN.ATTG_SYNC,
      state: { on: store.getState().foundation.attgSyncEnabled },
      theme: SYNC_TOGGLE_THEME,
      callback: () => {
        store.dispatch(attgSyncToggled());
      },
    });

    this._styleEditBtn = new SuiButton({
      id: FN.STYLE_EDIT,
      callback: () => {
        this._openStyleEdit();
      },
      theme: { default: { self: { iconId: "edit" as IconId } } },
    });

    this._styleBtnGen = new SeGenRefinePair({
      id: FN.STYLE_BTN,
      fieldId: "style",
      onGenerate: () => {
        store.dispatch(styleGenerationRequested());
      },
      refineSourceText: () => store.getState().foundation.style ?? "",
      stateProjection: foundationProjection("style"),
      requestIdFromProjection: (p) => p as string | undefined,
    });

    this._styleSyncToggle = new SuiToggle({
      id: FN.STYLE_SYNC,
      state: { on: store.getState().foundation.styleSyncEnabled },
      theme: SYNC_TOGGLE_THEME,
      callback: () => {
        store.dispatch(styleSyncToggled());
      },
    });
  }

  // ── Shape edit pane ────────────────────────────────────────────

  private _openShapeEdit(): void {
    const { editHost } = this.options;
    const shape = store.getState().foundation.shape;

    const pane = new SeContentWithTitlePane({
      id: IDS.EDIT_PANE.ROOT,
      title: shape?.name ?? "",
      content: shape?.description ?? "",
      label: "Edit Shape",
      titlePlaceholder: "e.g. Slice of Life, Tragedy, Heist…",
      contentPlaceholder:
        "Shape description — what structural moments this story leans toward.",
      titleLabel: "Name",
      contentLabel: "Description",
      onSave: (name, description) => {
        store.dispatch(
          shapeUpdated({
            shape: (name || description) ? { name: name || "STORY", description } : null,
          }),
        );
        editHost.close();
      },
      onBack: () => {
        editHost.close();
      },
    });

    editHost.open(pane);
  }

  // ── Intent edit pane ──────────────────────────────────────────

  private _openIntentEdit(): void {
    const { editHost } = this.options;
    const intent = store.getState().foundation.intent;

    const pane = new SeSimpleContentPane({
      id: IDS.EDIT_PANE.ROOT,
      content: intent,
      label: "Edit Intent",
      contentPlaceholder:
        "What is this story about? What do you want to explore?",
      onSave: (content) => {
        store.dispatch(intentUpdated({ intent: content }));
        editHost.close();
      },
      onBack: () => {
        editHost.close();
      },
    });

    editHost.open(pane);
  }

  // ── Contract edit pane ────────────────────────────────────────

  private _openContractEdit(): void {
    const { editHost } = this.options;
    const contract = store.getState().foundation.contract;

    const existing = contract
      ? `REQUIRED: ${contract.required}\nPROHIBITED: ${contract.prohibited}\nEMPHASIS: ${contract.emphasis}`
      : "";

    const pane = new SeSimpleContentPane({
      id: IDS.EDIT_PANE.ROOT,
      content: existing,
      label: "Edit Story Contract",
      contentPlaceholder: "REQUIRED: ...\nPROHIBITED: ...\nEMPHASIS: ...",
      onSave: (content) => {
        if (!content.trim()) {
          store.dispatch(contractUpdated({ contract: null }));
        } else {
          const req = content.match(/^REQUIRED:\s*(.+)$/m)?.[1]?.trim() || "";
          const proh = content.match(/^PROHIBITED:\s*(.+)$/m)?.[1]?.trim() || "";
          const emph = content.match(/^EMPHASIS:\s*(.+)$/m)?.[1]?.trim() || "";
          store.dispatch(contractUpdated({ contract: { required: req, prohibited: proh, emphasis: emph } }));
        }
        editHost.close();
      },
      onBack: () => {
        editHost.close();
      },
    });

    editHost.open(pane);
  }

  // ── ATTG edit pane ────────────────────────────────────────────

  private _openAttgEdit(): void {
    const { editHost } = this.options;
    const attg = store.getState().foundation.attg;

    const pane = new SeSimpleContentPane({
      id: IDS.EDIT_PANE.ROOT,
      content: attg,
      label: "Edit ATTG",
      contentPlaceholder: "Author, Title, Tags, Genre…",
      onSave: (content) => {
        store.dispatch(attgUpdated({ attg: content }));
        void this._syncMemory();
        editHost.close();
      },
      onBack: () => {
        editHost.close();
      },
    });

    editHost.open(pane);
  }

  // ── Style edit pane ───────────────────────────────────────────

  private _openStyleEdit(): void {
    const { editHost } = this.options;
    const style = store.getState().foundation.style;

    const pane = new SeSimpleContentPane({
      id: IDS.EDIT_PANE.ROOT,
      content: style,
      label: "Edit Style",
      contentPlaceholder: "Writing style, tone, prose directives…",
      onSave: (content) => {
        store.dispatch(styleUpdated({ style: content }));
        void this._syncMemory();
        editHost.close();
      },
      onBack: () => {
        editHost.close();
      },
    });

    editHost.open(pane);
  }

  // ── Memory sync helper ────────────────────────────────────────

  private async _syncMemory(): Promise<void> {
    const { attg, style, attgSyncEnabled, styleSyncEnabled } = store.getState().foundation;
    if (attgSyncEnabled) await api.v1.memory.set(attg.trim());
    if (styleSyncEnabled) await api.v1.an.set(style.trim());
  }

  // ── Compose ────────────────────────────────────────────────────

  async compose(): Promise<UIPartCollapsibleSection> {
    this._watcher.dispose();

    // ── Shape card + description text ────────────────────────
    const shape = store.getState().foundation.shape;
    const shapeDescId = `${FN.SHAPE_CARD}-desc`;

    const shapeCard = new SuiCard({
      id: FN.SHAPE_CARD,
      label: shape?.name || "Shape",
      labelCallback: () => {
        this._openShapeEdit();
      },
      actions: [this._shapeEditBtn, this._shapeBtnGen],
      theme: CARD_THEME,
    });

    this._watcher.watch(
      (s) => s.foundation.shape,
      (s) => {
        api.v1.ui.updateParts([
          { id: `${FN.SHAPE_CARD}.label`, text: s?.name || "Shape" },
          { id: shapeDescId, text: s?.description || "No shape defined" },
        ]);
      },
    );

    // ── Intent card + description text ──────────────────────
    const intent = store.getState().foundation.intent;
    const intentDescId = `${FN.INTENT_CARD}-desc`;

    const intentCard = new SuiCard({
      id: FN.INTENT_CARD,
      label: "Intent",
      labelCallback: () => {
        this._openIntentEdit();
      },
      actions: [this._intentEditBtn, this._intentBtnGen],
      theme: CARD_THEME,
    });

    this._watcher.watch(
      (s) => s.foundation.intent,
      (value) => {
        api.v1.ui.updateParts([
          {
            id: intentDescId,
            text: escapeDisplay(value) || "No intent defined",
          },
        ]);
      },
    );

    // ── Intensity card + level picker + description text ────
    const intensity = store.getState().foundation.intensity;
    const intensityDescId = `${FN.INTENSITY_CARD}-desc`;
    const currentLevel = intensity?.level ?? "";

    const intensityCard = new SuiCard({
      id: FN.INTENSITY_CARD,
      label: currentLevel || "Intensity",
      theme: CARD_THEME,
    });

    const _setLevel = (level: string, description: string): void => {
      store.dispatch(intensityUpdated({ intensity: { level, description } }));
      api.v1.ui.updateParts(
        INTENSITY_LEVELS.map((il) => ({
          id: `${FN.INTENSITY_CARD}-lvl-${il.level.toLowerCase()}`,
          style: il.level === level ? INTENSITY_STYLE_SELECTED : INTENSITY_STYLE_DEFAULT,
        })) as Array<Partial<UIPart> & { id: string }>,
      );
    };

    const intensityBar = new SuiActionBar({
      id: `${FN.INTENSITY_CARD}-bar`,
      left: INTENSITY_LEVELS.map(
        (il) =>
          new SuiButton({
            id: `${FN.INTENSITY_CARD}-lvl-${il.level.toLowerCase()}`,
            callback: () => { _setLevel(il.level, il.description); },
            theme: {
              default: {
                self: {
                  text: il.level,
                  style: il.level === currentLevel ? INTENSITY_STYLE_SELECTED : INTENSITY_STYLE_DEFAULT,
                },
              },
            },
          }),
      ),
      theme: { default: { left: { style: { "flex-wrap": "wrap" } } } },
    });

    this._watcher.watch(
      (s) => s.foundation.intensity,
      (value) => {
        const lvl = value?.level ?? "";
        api.v1.ui.updateParts([
          { id: `${FN.INTENSITY_CARD}.label`, text: lvl || "Intensity" },
          { id: intensityDescId, text: escapeDisplay(value?.description || "") || "No intensity defined" },
          ...INTENSITY_LEVELS.map((il) => ({
            id: `${FN.INTENSITY_CARD}-lvl-${il.level.toLowerCase()}`,
            style: il.level === lvl ? INTENSITY_STYLE_SELECTED : INTENSITY_STYLE_DEFAULT,
          })),
        ] as Array<Partial<UIPart> & { id: string }>);
      },
    );

    // ── Contract card + description text ─────────────────────
    const contract = store.getState().foundation.contract;
    const contractDescId = `${FN.CONTRACT_CARD}-desc`;

    const contractCard = new SuiCard({
      id: FN.CONTRACT_CARD,
      label: "Story Contract",
      labelCallback: () => {
        this._openContractEdit();
      },
      actions: [this._contractEditBtn, this._contractBtnGen],
      theme: CARD_THEME,
    });

    this._watcher.watch(
      (s) => s.foundation.contract,
      (value) => {
        const text = value
          ? `Required: ${value.required}\nProhibited: ${value.prohibited}\nEmphasis: ${value.emphasis}`
          : "";
        api.v1.ui.updateParts([
          { id: contractDescId, text: escapeDisplay(text) || "No contract defined" },
        ]);
      },
    );

    // ── ATTG card + description text ────────────────────────
    const attg = store.getState().foundation.attg;
    const attgDescId = `${FN.ATTG_CARD}-desc`;

    const attgCard = new SuiCard({
      id: FN.ATTG_CARD,
      label: "ATTG (Memory)",
      labelCallback: () => {
        this._openAttgEdit();
      },
      actions: [this._attgSyncToggle, this._attgEditBtn, this._attgBtnGen],
      theme: CARD_THEME,
    });

    this._watcher.watch(
      (s) => s.foundation.attg,
      (value) => {
        api.v1.ui.updateParts([
          { id: attgDescId, text: escapeDisplay(value) || "No ATTG defined" },
        ]);
      },
    );

    // ── Style card + description text ────────────────────────
    const style = store.getState().foundation.style;
    const styleDescId = `${FN.STYLE_CARD}-desc`;

    const styleCard = new SuiCard({
      id: FN.STYLE_CARD,
      label: "Style (Author's Note)",
      labelCallback: () => {
        this._openStyleEdit();
      },
      actions: [this._styleSyncToggle, this._styleEditBtn, this._styleBtnGen],
      theme: CARD_THEME,
    });

    this._watcher.watch(
      (s) => s.foundation.style,
      (value) => {
        api.v1.ui.updateParts([
          { id: styleDescId, text: escapeDisplay(value) || "No style defined" },
        ]);
      },
    );

    // ── Sync toggle state watchers (Redux → SuiToggle visual) ──
    this._watcher.watch(
      (s) => s.foundation.attgSyncEnabled,
      (on) => {
        if (this._attgSyncToggle.state.on !== on) {
          void this._attgSyncToggle.setState({ on });
        }
        if (on) void this._syncMemory();
      },
    );

    this._watcher.watch(
      (s) => s.foundation.styleSyncEnabled,
      (on) => {
        if (this._styleSyncToggle.state.on !== on) {
          void this._styleSyncToggle.setState({ on });
        }
        if (on) void this._syncMemory();
      },
    );

    // ── Build child parts ──────────────────────────────────────
    const [shapeCardPart, intentCardPart, intensityCardPart, intensityBarPart, contractCardPart, attgCardPart, styleCardPart] =
      await Promise.all([
        shapeCard.build(),
        intentCard.build(),
        intensityCard.build(),
        intensityBar.build(),
        contractCard.build(),
        attgCard.build(),
        styleCard.build(),
      ]);

    const { column, text, collapsibleSection } = api.v1.ui.part;

    return collapsibleSection({
      id: this.id,
      title: "Narrative Foundation",
      content: [
        column({
          style: { gap: "8px" },
          content: [
            // Intensity — card header + level picker + description text (first: sets the register)
            column({
              style: { gap: "2px" },
              content: [
                intensityCardPart,
                intensityBarPart,
                text({
                  id: intensityDescId,
                  text: escapeDisplay(intensity?.description || "") || "No intensity defined",
                  style: CONTENT_TEXT_STYLE,
                }),
              ],
            }),
            // Shape — card header + description text below
            column({
              style: { gap: "2px" },
              content: [
                shapeCardPart,
                text({
                  id: shapeDescId,
                  text: shape?.description || "No shape defined",
                  style: CONTENT_TEXT_STYLE,
                }),
              ],
            }),
            // Intent — card header + content text below
            column({
              style: { gap: "2px" },
              content: [
                intentCardPart,
                text({
                  id: intentDescId,
                  text: escapeDisplay(intent) || "No intent defined",
                  style: CONTENT_TEXT_STYLE,
                }),
              ],
            }),
            // Contract — card header + content text below
            column({
              style: { gap: "2px" },
              content: [
                contractCardPart,
                text({
                  id: contractDescId,
                  text: contract
                    ? escapeDisplay(`Required: ${contract.required}\nProhibited: ${contract.prohibited}\nEmphasis: ${contract.emphasis}`)
                    : "No contract defined",
                  style: CONTENT_TEXT_STYLE,
                }),
              ],
            }),
            // ATTG — card header + content text below
            column({
              style: { gap: "2px" },
              content: [
                attgCardPart,
                text({
                  id: attgDescId,
                  text: escapeDisplay(attg) || "No ATTG defined",
                  style: CONTENT_TEXT_STYLE,
                }),
              ],
            }),
            // Style — card header + content text below
            column({
              style: { gap: "2px" },
              content: [
                styleCardPart,
                text({
                  id: styleDescId,
                  text: escapeDisplay(style) || "No style defined",
                  style: CONTENT_TEXT_STYLE,
                }),
              ],
            }),
          ],
        }),
      ],
    });
  }
}
