/**
 * SeForgeSection — SUI replacement for ForgeSection.ts.
 *
 * Collapsible section containing:
 *   - Clear forge button (upper right)
 *   - Guidance multilineTextInput (storageKey)
 *   - Forge SeGenerationButton
 *   - Ticker text (updated by generation handlers)
 *   - Draft entity list column (rebuilt via StoreWatcher when entity IDs change)
 *   - Cast All / Discard All row (visibility toggled via StoreWatcher)
 *
 * Entity list is rebuilt with updateParts (targeted) so nai-act components
 * in the same panel are not disturbed.
 */

import { SuiComponent, type SuiComponentOptions } from "nai-simple-ui";
import { store } from "../../core/store";
import {
  forgeRequested,
  forgeClearRequested,
  castAllRequested,
  discardAllRequested,
} from "../../core/store/slices/world";
import { IDS, STORAGE_KEYS } from "../../ui/framework/ids";
import { StoreWatcher } from "../store-watcher";
import { SeGenerationButton } from "./SeGenerationButton";
import { SeConfirmButton } from "./SeConfirmButton";
import { SeEntityCard } from "./SeEntityCard";
import type { EditPaneHost } from "./SeContentWithTitlePane";

type SeForgeSectionTheme = { default: { self: { style: object } } };
type SeForgeSectionState = Record<string, never>;

export type SeForgeSectionOptions = {
  editHost: EditPaneHost;
} & SuiComponentOptions<SeForgeSectionTheme, SeForgeSectionState>;

const FG = IDS.FORGE;

const CAST_DISCARD_ROW_STYLE: object = { gap: "4px", "margin-top": "4px" };
const CAST_DISCARD_HIDDEN_STYLE: object = {
  gap: "4px",
  "margin-top": "4px",
  display: "none",
};

export class SeForgeSection extends SuiComponent<
  SeForgeSectionTheme,
  SeForgeSectionState,
  SeForgeSectionOptions,
  UIPartCollapsibleSection
> {
  private readonly _watcher: StoreWatcher;
  private readonly _forgeBtn: SeGenerationButton;
  private readonly _clearBtn: SeConfirmButton;

  constructor(options: SeForgeSectionOptions) {
    super(
      { state: {} as SeForgeSectionState, ...options },
      { default: { self: { style: {} } } },
    );

    this._watcher = new StoreWatcher();

    this._forgeBtn = new SeGenerationButton({
      id: FG.FORGE_BTN,
      label: "Forge",
      onGenerate: () => {
        store.dispatch(forgeRequested());
      },
      stateProjection: (s) => ({
        loopActive: s.world.forgeLoopActive,
        activeForgeId:
          s.runtime.activeRequest?.type === "forge"
            ? s.runtime.activeRequest.id
            : undefined,
      }),
      requestIdFromProjection: (p) =>
        (p as { loopActive: boolean; activeForgeId?: string }).activeForgeId,
      isDisabledFromProjection: (p) => {
        const { loopActive, activeForgeId } = p as {
          loopActive: boolean;
          activeForgeId?: string;
        };
        return loopActive && !activeForgeId;
      },
    });

    this._clearBtn = new SeConfirmButton({
      id: FG.CLEAR_BTN,
      label: "Clear",
      confirmLabel: "Clear forge?",
      style: { "font-size": "0.75em", opacity: "0.5", padding: "2px 8px" },
      onConfirm: async () => {
        store.dispatch(forgeClearRequested());
      },
    });
  }

  private async _rebuildEntityList(): Promise<void> {
    const { editHost } = this.options;
    const entities = Object.values(store.getState().world.entitiesById).filter(
      (e) => e.lifecycle === "draft",
    );
    const parts = await Promise.all(
      entities.map((e) =>
        new SeEntityCard({
          id: IDS.entity(e.id, "draft").ROOT,
          entityId: e.id,
          lifecycle: "draft",
          editHost,
        }).build(),
      ),
    );
    api.v1.ui.updateParts([
      { id: FG.ENTITY_LIST, content: parts } as unknown as Partial<UIPart> & {
        id: string;
      },
    ]);
  }

  async compose(): Promise<UIPartCollapsibleSection> {
    const {
      column,
      row,
      text,
      button,
      collapsibleSection,
      multilineTextInput,
    } = api.v1.ui.part;

    this._watcher.dispose();

    // Rebuild entity list when draft entity IDs change
    this._watcher.watch(
      (s) =>
        Object.values(s.world.entitiesById)
          .filter((e) => e.lifecycle === "draft")
          .map((e) => e.id),
      () => {
        void this._rebuildEntityList();
      },
      (a, b) => a.length === b.length && a.every((id, i) => id === b[i]),
    );

    // Toggle cast/discard row visibility
    this._watcher.watch(
      (s) => Object.values(s.world.entitiesById).some((e) => e.lifecycle === "draft"),
      (hasDraft) => {
        api.v1.ui.updateParts([
          {
            id: FG.CAST_DISCARD_ROW,
            style: hasDraft
              ? CAST_DISCARD_ROW_STYLE
              : CAST_DISCARD_HIDDEN_STYLE,
          } as unknown as Partial<UIPart> & { id: string },
        ]);
      },
    );

    const [forgeBtnPart, clearBtnPart] = await Promise.all([
      this._forgeBtn.build(),
      this._clearBtn.build(),
    ]);

    // Build initial entity list
    const state = store.getState();
    const draftEntities = Object.values(state.world.entitiesById).filter(
      (e) => e.lifecycle === "draft",
    );
    const hasDraftEntities = draftEntities.length > 0;

    const { editHost } = this.options;
    const initialEntityParts = await Promise.all(
      draftEntities.map((e) =>
        new SeEntityCard({
          id: IDS.entity(e.id, "draft").ROOT,
          entityId: e.id,
          lifecycle: "draft",
          editHost,
        }).build(),
      ),
    );

    const guidanceInput = multilineTextInput({
      id: FG.GUIDANCE_INPUT,
      placeholder:
        "What should the Forge build? Leave blank to draw from your Brainstorm conversation.",
      initialValue: "",
      storageKey: `story:${STORAGE_KEYS.FORGE_GUIDANCE_UI}`,
      style: { "min-height": "5em", "font-size": "0.85em" },
    });

    const ticker = text({
      id: FG.TICKER,
      text: "",
      style: {
        "font-size": "0.75em",
        opacity: "0.5",
        "font-style": "italic",
        "min-height": "1em",
      },
    });

    const entityList = column({
      id: FG.ENTITY_LIST,
      style: { gap: "2px" },
      content: initialEntityParts,
    });

    const castDiscardRow = row({
      id: FG.CAST_DISCARD_ROW,
      style: hasDraftEntities
        ? CAST_DISCARD_ROW_STYLE
        : CAST_DISCARD_HIDDEN_STYLE,
      content: [
        button({
          id: FG.CAST_ALL_BTN,
          text: "→ Cast All",
          style: { flex: "1", "font-size": "0.85em" },
          callback: () => {
            store.dispatch(castAllRequested());
          },
        }),
        button({
          id: FG.DISCARD_ALL_BTN,
          text: "✕ Discard All",
          style: { flex: "1", "font-size": "0.85em" },
          callback: () => {
            store.dispatch(discardAllRequested());
          },
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
            row({
              style: { "justify-content": "flex-end" },
              content: [clearBtnPart],
            }),
            guidanceInput,
            forgeBtnPart,
            ticker,
            text({
              style: {
                "border-top": "1px solid rgba(128,128,128,0.2)",
                margin: "6px 0",
              },
            }),
            entityList,
            castDiscardRow,
          ],
        }),
      ],
    });
  }
}
