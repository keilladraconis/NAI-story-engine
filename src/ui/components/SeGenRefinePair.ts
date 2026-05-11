/**
 * SeGenRefinePair — Horizontal [Generate | Refine] icon button pair.
 *
 * Drops in place of a bare generation button to enable refine UX.
 * Left: SeGenerationIconButton (zap icon)
 * Right: Refine button (feather icon) — dispatches uiChatRefineRequested
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
  /** Called at click time to source the current field text (live read).
   *  Async is supported so callers can read directly from storyStorage rather
   *  than maintaining a parallel sync cache. */
  refineSourceText: () => string | Promise<string>;
  hasContent?: boolean;
  contentChecker?: () => Promise<boolean>;
  /** Pass-through to SeGenerationIconButton for dynamic request ID resolution. */
  stateProjection?: (s: RootState) => unknown;
  /** Pass-through to SeGenerationIconButton for extracting ID from projection. */
  requestIdFromProjection?: (p: unknown) => string | undefined;
  /** Optional entry ID for lorebook refine. Static when the caller has it at
   *  construction time (e.g. SeLorebookContentPane). */
  entryId?: string;
  /** Optional lazy resolver for entry ID — preferred when the entry doesn't
   *  exist yet (drafts) and needs to be promoted at click time, or when the
   *  binding may change after construction. Resolves to undefined to bail. */
  resolveEntryId?: () => string | undefined | Promise<string | undefined>;
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
          iconId: "feather",
          style: {
            background: "none",
            border: "none",
            padding: "6px 8px",
            margin: "0",
            opacity: "1",
            cursor: "pointer",
          },
          callback: () => void this._handleRefineClick(),
        }),
      ],
    });
  }

  private async _handleRefineClick(): Promise<void> {
    const sourceText = (await this.options.refineSourceText()).trim();
    if (!sourceText) {
      api.v1.ui.toast("Nothing to refine — field is empty.", { type: "info" });
      return;
    }
    const entryId = this.options.resolveEntryId
      ? await this.options.resolveEntryId()
      : this.options.entryId;
    store.dispatch(
      uiChatRefineRequested({
        fieldId: this.options.fieldId,
        sourceText,
        entryId,
      }),
    );
  }
}
