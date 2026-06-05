/**
 * SeGenRefinePair — Generate / Refine icon control for a field.
 *
 * Two render modes:
 *   - pair (default): [Generate (zap)] [Refine (feather)] — legacy two-button UX.
 *   - unified (`unified: true`): a single [zap] that adapts on click — an empty
 *     field generates, a field with content opens a refine. No feather. This is
 *     the unified affordance for inline field cards.
 *
 * The refine path reads source text via the caller's refineSourceText() callback
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
  /** Render a single adaptive [zap] (empty → generate, has content → refine)
   *  instead of the [zap][feather] pair. */
  unified?: boolean;
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
    // In unified mode the zap click is intercepted to branch on content
    // (empty → generate, content → refine), so the inner button gets neither
    // the direct generateAction nor onGenerate — _handleUnifiedClick runs them.
    this._gen = new SeGenerationIconButton({
      id: `${options.id}-gen`,
      iconId: "zap",
      requestId: options.generateRequestId,
      generateAction: options.unified ? undefined : options.generateAction,
      onGenerate: options.unified
        ? () => void this._handleUnifiedClick()
        : options.onGenerate,
      hasContent: options.hasContent,
      contentChecker: options.contentChecker,
      stateProjection: options.stateProjection,
      requestIdFromProjection: options.requestIdFromProjection,
    });
  }

  /** Run the caller's field generate (empty-field path). */
  private _generateField(): void {
    if (this.options.generateAction)
      store.dispatch(this.options.generateAction);
    this.options.onGenerate?.();
  }

  async compose(): Promise<UIPartRow> {
    const { row, button } = api.v1.ui.part;

    const genPart = await this._gen.build();

    if (this.options.unified) {
      // Single adaptive [zap]; the click is intercepted in the inner button
      // (_handleUnifiedClick) to branch on content. No feather.
      return row({
        id: this.id,
        style: { "align-items": "center" },
        content: [genPart],
      });
    }

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

  /** Unified-mode zap: an empty field generates, a populated field opens a
   *  refine. Source text is read live at click time. */
  private async _handleUnifiedClick(): Promise<void> {
    const sourceText = (await this.options.refineSourceText()).trim();
    if (sourceText) {
      await this._openRefine(sourceText);
      return;
    }
    this._generateField();
  }

  private async _handleRefineClick(): Promise<void> {
    const sourceText = (await this.options.refineSourceText()).trim();
    if (!sourceText) {
      api.v1.ui.toast("Nothing to refine — field is empty.", { type: "info" });
      return;
    }
    await this._openRefine(sourceText);
  }

  private async _openRefine(sourceText: string): Promise<void> {
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
