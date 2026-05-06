/**
 * SeGenRefinePair — Horizontal [Generate | Refine] icon button pair.
 *
 * Drops in place of a bare generation button to enable refine UX.
 * Left: SeGenerationIconButton (zap icon)
 * Right: Refine button (edit-2 icon) — dispatches uiChatRefineRequested
 *
 * The refine button reads source text via caller's refineSourceText() callback
 * at click time (live read), trims, and bails with a toast if empty.
 */

import { SuiComponent, type SuiComponentOptions } from "nai-simple-ui";
import { store } from "../../core/store";
import { uiChatRefineRequested } from "../../core/store/slices/ui";
import { SeGenerationIconButton } from "./SeGenerationButton";
import type { RootState } from "../../core/store/types";

type Theme = { default: { self: { style: object } } };
type State = Record<string, never>;

export type SeGenRefinePairOptions = {
  fieldId: string;
  generateRequestId?: string;
  generateAction?: { type: string; payload?: unknown };
  onGenerate?: () => void;
  /** Called at click time to source the current field text (live read). */
  refineSourceText: () => string;
  hasContent?: boolean;
  contentChecker?: () => Promise<boolean>;
  /** Pass-through to SeGenerationIconButton for dynamic request ID resolution. */
  stateProjection?: (s: RootState) => unknown;
  /** Pass-through to SeGenerationIconButton for extracting ID from projection. */
  requestIdFromProjection?: (p: unknown) => string | undefined;
  /** Optional entry ID for lorebook refine. */
  entryId?: string;
} & SuiComponentOptions<Theme, State>;

export class SeGenRefinePair extends SuiComponent<
  Theme,
  State,
  SeGenRefinePairOptions,
  UIPartRow
> {
  private readonly _gen: SeGenerationIconButton;

  constructor(options: SeGenRefinePairOptions) {
    super(
      { state: {} as State, ...options },
      { default: { self: { style: {} } } },
    );
    this._gen = new SeGenerationIconButton({
      id: `${options.id}-gen`,
      iconId: "zap",
      requestId: options.generateRequestId,
      generateAction: options.generateAction,
      onGenerate: options.onGenerate,
      hasContent: options.hasContent,
      contentChecker: options.contentChecker,
      stateProjection: options.stateProjection,
      requestIdFromProjection: options.requestIdFromProjection,
    });
  }

  async compose(): Promise<UIPartRow> {
    const { row, button } = api.v1.ui.part;

    const genPart = await this._gen.build();

    return row({
      id: this.id,
      style: { gap: "4px", "align-items": "center" },
      content: [
        genPart,
        button({
          id: `${this.id}-refine`,
          iconId: "edit-2",
          style: {
            background: "none",
            border: "none",
            padding: "6px 8px",
            margin: "0",
            opacity: "1",
            cursor: "pointer",
          },
          callback: () => this._handleRefineClick(),
        }),
      ],
    });
  }

  private _handleRefineClick(): void {
    const sourceText = this.options.refineSourceText().trim();
    if (!sourceText) {
      api.v1.ui.toast("Nothing to refine — field is empty.", { type: "info" });
      return;
    }
    store.dispatch(
      uiChatRefineRequested({
        fieldId: this.options.fieldId,
        sourceText,
        entryId: this.options.entryId,
      }),
    );
  }
}
