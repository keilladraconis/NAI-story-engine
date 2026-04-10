/**
 * SeForgeSection — Forge guidance input + generation button.
 *
 * Contains:
 *   - Clear forge button (upper right) — clears the guidance input
 *   - Guidance multilineTextInput (storageKey)
 *   - Forge SeGenerationButton
 *   - Ticker text (updated by generation handlers)
 */

import { SuiComponent, type SuiComponentOptions } from "nai-simple-ui";
import { store } from "../../core/store";
import { forgeRequested, forgeClearRequested } from "../../core/store/slices/world";
import { IDS, STORAGE_KEYS } from "../../ui/framework/ids";
import { SeGenerationButton } from "./SeGenerationButton";
import { SeConfirmButton } from "./SeConfirmButton";

type SeForgeSectionTheme = { default: { self: { style: object } } };
type SeForgeSectionState = Record<string, never>;

export type SeForgeSectionOptions = SuiComponentOptions<SeForgeSectionTheme, SeForgeSectionState>;

const FG = IDS.FORGE;

export class SeForgeSection extends SuiComponent<
  SeForgeSectionTheme,
  SeForgeSectionState,
  SeForgeSectionOptions,
  UIPartCollapsibleSection
> {
  private readonly _forgeBtn: SeGenerationButton;
  private readonly _clearBtn: SeConfirmButton;

  constructor(options: SeForgeSectionOptions) {
    super(
      { state: {} as SeForgeSectionState, ...options },
      { default: { self: { style: {} } } },
    );

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
      confirmLabel: "Clear forge guidance?",
      style: { "font-size": "0.75em", opacity: "0.5", padding: "2px 8px" },
      onConfirm: async () => {
        store.dispatch(forgeClearRequested());
      },
    });
  }

  async compose(): Promise<UIPartCollapsibleSection> {
    const {
      column,
      row,
      text,
      collapsibleSection,
      multilineTextInput,
    } = api.v1.ui.part;

    const [forgeBtnPart, clearBtnPart] = await Promise.all([
      this._forgeBtn.build(),
      this._clearBtn.build(),
    ]);

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

    return collapsibleSection({
      id: FG.SECTION,
      title: "Forge",
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
          ],
        }),
      ],
    });
  }
}
