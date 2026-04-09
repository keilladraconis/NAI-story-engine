/**
 * SeGenerationButton — SUI replacement for GenerationButton.ts
 *
 * Manages a 6-mode state machine (gen/queue/cancel/continue/wait/disabled)
 * by watching the runtime slice via StoreWatcher. Two variants:
 *   "button" — full-width row of mode-specific buttons (show/hide via display)
 *   "icon"   — single compact button that mutates in place
 *
 * Store → component flow:
 *   StoreWatcher.watch() → computeMode() → setState() → onSync() → updateParts()
 * Timer (budget wait):
 *   Managed separately via generation counter — no clearTimeout needed.
 */

import { SuiComponent, type SuiComponentOptions } from "nai-simple-ui";
import { store } from "../../core/store";
import {
  uiCancelRequest,
  uiRequestCancellation,
  uiUserPresenceConfirmed,
} from "../../core/store";
import { StoreWatcher } from "../store-watcher";
import type { RootState } from "../../core/store/types";
import { colors } from "../theme";

// ── Types ───────────────────────────────────────────────────────────────────

export type SeGenButtonVariant = "button" | "icon";
type Mode = "gen" | "queue" | "cancel" | "continue" | "wait" | "disabled";

type SeGenButtonState = {
  mode: Mode;
  timerEnd: number; // epoch ms — 0 when not in wait mode
  hasContent: boolean;
};

type SeGenButtonTheme = {
  default: { self: { style: object } };
};

export type SeGenerationButtonOptions = {
  /** Static request ID — tracks one queued/active request. */
  requestId?: string;
  /** Multiple IDs to track (ANY active = cancel mode). */
  requestIds?: string[];
  /** Selector for dynamic requestId resolution / disabled state. */
  stateProjection?: (s: RootState) => unknown;
  requestIdFromProjection?: (p: unknown) => string | undefined;
  isDisabledFromProjection?: (p: unknown) => boolean;
  /** Action dispatched on generate (for field/foundation buttons). */
  generateAction?: { type: string; payload?: unknown };
  /** Callback alternative to generateAction. */
  onGenerate?: () => void;
  label?: string;
  variant?: SeGenButtonVariant;
  iconId?: IconId;
  /** Custom cancel handler — defaults to uiRequestCancellation(). */
  onCancel?: () => void;
  /** Custom continue handler — defaults to uiUserPresenceConfirmed(). */
  onContinue?: () => void;
  /** Initial hasContent value for icon idle styling. */
  hasContent?: boolean;
  /** Async check called on mount and on each switch to idle (icon variant). */
  contentChecker?: () => Promise<boolean>;
  /** Style applied to the button row wrapper (button variant only). */
  style?: object;
} & SuiComponentOptions<SeGenButtonTheme, SeGenButtonState>;

// ── Styles ──────────────────────────────────────────────────────────────────

const BTN_BASE: object = { width: "100%", "font-weight": "bold" };

const BTN_STYLES = {
  gen: BTN_BASE,
  disabled: { ...BTN_BASE, opacity: "0.5", cursor: "not-allowed" },
  queue: {
    ...BTN_BASE,
    "background-color": colors.darkBackground,
    color: colors.paragraph,
    cursor: "pointer",
  },
  cancel: {
    ...BTN_BASE,
    background: colors.warning,
    color: colors.darkBackground,
  },
  continue: {
    ...BTN_BASE,
    background: colors.header,
    color: colors.darkBackground,
  },
  wait: {
    ...BTN_BASE,
    "background-color": colors.darkBackground,
    color: colors.paragraph,
  },
} as const;

const ICON_STYLES = {
  idle: { padding: "4px", opacity: "0.3", cursor: "pointer" },
  idleWithContent: {
    padding: "4px",
    opacity: "1",
    cursor: "pointer",
    color: "rgb(144,238,144)",
  },
  queued: {
    padding: "4px",
    opacity: "1",
    cursor: "pointer",
    color: colors.header,
  },
  cancel: {
    padding: "4px",
    opacity: "1",
    cursor: "pointer",
    color: colors.warning,
  },
  continue: {
    padding: "4px",
    opacity: "1",
    cursor: "pointer",
    color: colors.header,
  },
  wait: {
    padding: "4px",
    opacity: "0.6",
    cursor: "pointer",
    color: colors.header,
  },
} as const;

// ── Mode computation (pure) ──────────────────────────────────────────────────

type ModeSlice = { mode: Mode; timerEnd: number };

/** Build a memoized selector that returns a cached {mode, timerEnd} when the
 *  specific runtime fields it reads haven't changed by reference. During
 *  streaming only genx internals change — queue, activeRequest, sega, and
 *  projection references stay stable, so all ~35 instances short-circuit. */
function buildModeSelector(opts: SeGenerationButtonOptions) {
  let _activeId: string | undefined;
  let _queue: RootState["runtime"]["queue"];
  let _genxStatus: string;
  let _timerEnd: number;
  let _projection: unknown;
  let _cache: ModeSlice = { mode: "gen", timerEnd: 0 };

  // seed with current state
  const s0 = store.getState();
  _activeId = s0.runtime.activeRequest?.id;
  _queue = s0.runtime.queue;
  _genxStatus = s0.runtime.genx.status;
  _timerEnd = s0.runtime.genx.budgetWaitEndTime ?? 0;
  _projection = opts.stateProjection?.(s0);
  _cache = { mode: computeMode(opts, s0), timerEnd: _timerEnd };

  return (s: RootState): ModeSlice => {
    const activeId = s.runtime.activeRequest?.id;
    const queue = s.runtime.queue;
    const genxStatus = s.runtime.genx.status;
    const timerEnd = s.runtime.genx.budgetWaitEndTime ?? 0;
    const projection = opts.stateProjection?.(s);

    if (
      activeId === _activeId &&
      queue === _queue &&
      genxStatus === _genxStatus &&
      timerEnd === _timerEnd &&
      projection === _projection
    ) {
      return _cache;
    }

    _activeId = activeId;
    _queue = queue;
    _genxStatus = genxStatus;
    _timerEnd = timerEnd;
    _projection = projection;

    const mode = computeMode(opts, s);
    if (mode === _cache.mode && timerEnd === _cache.timerEnd) return _cache;
    _cache = { mode, timerEnd };
    return _cache;
  };
}

function computeMode(
  opts: SeGenerationButtonOptions,
  s: RootState,
): Mode {
  const activeRequestId = s.runtime.activeRequest?.id;
  const genxStatus = s.runtime.genx.status;
  const hasProjection = !!opts.stateProjection;
  const customProjection = opts.stateProjection?.(s);

  const resolvedId = opts.requestIdFromProjection
    ? opts.requestIdFromProjection(customProjection)
    : opts.requestId;

  const isDisabled = opts.isDisabledFromProjection?.(customProjection) ?? false;
  if (isDisabled) return "disabled";

  const allIds: string[] = opts.requestIds ?? (resolvedId ? [resolvedId] : []);

  if (allIds.length > 0) {
    const isProcessing = allIds.some((id) => id === activeRequestId);
    const isQueued = allIds.some((id) =>
      s.runtime.queue.some((q) => q.id === id),
    );

    if (isQueued) return "queue";
    if (isProcessing) {
      if (genxStatus === "waiting_for_user") return "continue";
      if (genxStatus === "waiting_for_budget") return "wait";
      return "cancel";
    }
    return "gen";
  }

  // Global fallback — only for buttons without a custom projection
  if (!hasProjection && genxStatus !== "idle") {
    if (genxStatus === "queued") return "queue";
    if (genxStatus === "waiting_for_user") return "continue";
    if (genxStatus === "waiting_for_budget") return "wait";
    return "cancel";
  }

  return "gen";
}

// ── SeGenerationButton ───────────────────────────────────────────────────────

export class SeGenerationButton extends SuiComponent<
  SeGenButtonTheme,
  SeGenButtonState,
  SeGenerationButtonOptions,
  UIPartButton | UIPartRow
> {
  private readonly _watcher: StoreWatcher;
  private readonly _modeSelector: (s: RootState) => ModeSlice;
  private _timerGen = 0;
  private _prevMode: Mode;

  constructor(options: SeGenerationButtonOptions) {
    const s0 = store.getState();
    const initMode = computeMode(options, s0);
    super(
      {
        state: {
          mode: initMode,
          timerEnd: s0.runtime.genx.budgetWaitEndTime ?? 0,
          hasContent: options.hasContent ?? false,
        },
        ...options,
      },
      { default: { self: { style: {} } } },
    );
    this._watcher = new StoreWatcher();
    this._modeSelector = buildModeSelector(options);
    this._prevMode = initMode;
  }

  // ── Lifecycle ─────────────────────────────────────────────

  async compose(): Promise<UIPartButton | UIPartRow> {
    // Content check for icon variant
    if (this.options.variant === "icon" && this.options.contentChecker) {
      this.options.contentChecker().then((has) => {
        void this.setState({ ...this.state, hasContent: has });
      });
    }

    // Subscribe to store — memoized selector short-circuits during streaming
    this._watcher.watch(
      this._modeSelector,
      async ({ mode, timerEnd }) => {
        if (mode === this.state.mode && mode !== "wait") return;
        await this.setState({
          mode,
          timerEnd: timerEnd || Date.now() + 60000,
          hasContent: this.state.hasContent,
        });
      },
      (a, b) => a === b, // reference equality — buildModeSelector returns cached object when unchanged
    );

    return this.options.variant === "icon"
      ? this._buildIconPart()
      : this._buildButtonPart();
  }

  override async onSync(): Promise<void> {
    const { mode, timerEnd, hasContent } = this.state;
    const transitionedToGen = mode === "gen" && this._prevMode !== "gen";
    this._prevMode = mode;

    if (this.options.variant === "icon") {
      this._syncIcon(mode, hasContent);
    } else {
      this._syncButton(mode);
    }

    if (mode === "wait") {
      this._startTimer(timerEnd);
    } else {
      this._stopTimer();
    }

    // Re-check content only when transitioning back to gen after a generation.
    // Never call on every sync — that creates an infinite loop via setState → onSync.
    if (
      transitionedToGen &&
      this.options.variant === "icon" &&
      this.options.contentChecker
    ) {
      this.options.contentChecker().then((has) => {
        if (this.state.mode === "gen") {
          void this.setState({ ...this.state, hasContent: has });
        }
      });
    }
  }

  // ── Actions ───────────────────────────────────────────────

  private _generate(): void {
    if (this.options.generateAction)
      store.dispatch(this.options.generateAction);
    this.options.onGenerate?.();
  }

  private _cancel(): void {
    const { requestIds, requestId, onCancel } = this.options;
    if (requestIds && requestIds.length > 0) {
      requestIds.forEach((id) =>
        store.dispatch(uiCancelRequest({ requestId: id })),
      );
    } else if (requestId) {
      store.dispatch(uiCancelRequest({ requestId }));
    } else if (onCancel) {
      onCancel();
    }
  }

  private _cancelActive(): void {
    if (this.options.onCancel) {
      this.options.onCancel();
    } else {
      store.dispatch(uiRequestCancellation());
    }
    const { requestIds } = this.options;
    if (requestIds && requestIds.length > 0) {
      requestIds.forEach((id) =>
        store.dispatch(uiCancelRequest({ requestId: id })),
      );
    }
  }

  private _cancelWait(): void {
    this._stopTimer();
    if (this.options.variant === "icon") {
      const { iconId } = this.options;
      api.v1.ui.updateParts([
        {
          id: this.id,
          iconId,
          text: undefined,
          style: ICON_STYLES.idle,
          callback: () => this._generate(),
        },
      ]);
    } else {
      this._syncButton("gen");
    }
    this._cancelActive();
  }

  private _continue(): void {
    if (this.options.onContinue) {
      this.options.onContinue();
    } else {
      store.dispatch(uiUserPresenceConfirmed());
    }
  }

  // ── Icon variant ──────────────────────────────────────────

  private _buildIconPart(): UIPartButton {
    const { iconId, hasContent } = {
      ...this.options,
      hasContent: this.state.hasContent,
    };
    return {
      type: "button",
      id: this.id,
      iconId,
      style: hasContent ? ICON_STYLES.idleWithContent : ICON_STYLES.idle,
      callback: () => this._generate(),
    };
  }

  private _syncIcon(mode: Mode, hasContent: boolean): void {
    const { iconId } = this.options;
    switch (mode) {
      case "gen":
      case "disabled":
        api.v1.ui.updateParts([
          {
            id: this.id,
            iconId,
            text: undefined,
            style: hasContent ? ICON_STYLES.idleWithContent : ICON_STYLES.idle,
            callback: mode === "disabled" ? undefined : () => this._generate(),
          },
        ]);
        break;
      case "queue":
        api.v1.ui.updateParts([
          {
            id: this.id,
            iconId: "clock" as IconId,
            text: undefined,
            style: ICON_STYLES.queued,
            callback: () => this._cancel(),
          },
        ]);
        break;
      case "cancel":
        api.v1.ui.updateParts([
          {
            id: this.id,
            iconId: "x" as IconId,
            text: undefined,
            style: ICON_STYLES.cancel,
            callback: () => this._cancelActive(),
          },
        ]);
        break;
      case "continue":
        api.v1.ui.updateParts([
          {
            id: this.id,
            iconId: "fast-forward" as IconId,
            text: undefined,
            style: ICON_STYLES.continue,
            callback: () => this._continue(),
          },
        ]);
        break;
      case "wait":
        // Timer will drive display updates via _updateTimerDisplay
        break;
    }
  }

  // ── Button variant ────────────────────────────────────────

  private _buildButtonPart(): UIPartRow {
    const { label = "", iconId, style = {} } = this.options;
    const { button, row } = api.v1.ui.part;

    return row({
      id: this.id,
      style: { gap: "4px", alignItems: "center", ...style },
      content: [
        button({
          id: `${this.id}-gen`,
          text: `${iconId ? "" : "⚡"} ${label}`,
          iconId,
          style: { ...BTN_STYLES.gen, display: "block" },
          callback: () => this._generate(),
        }),
        button({
          id: `${this.id}-queue`,
          text: label ? "⏳ Queued" : "⏳",
          style: { ...BTN_STYLES.queue, display: "none" },
          callback: () => this._cancel(),
        }),
        button({
          id: `${this.id}-cancel`,
          text: label ? "🚫 Cancel" : "🚫",
          style: { ...BTN_STYLES.cancel, display: "none" },
          callback: () => this._cancelActive(),
        }),
        button({
          id: `${this.id}-continue`,
          text: label ? "⚠️ Continue" : "⚠️",
          style: { ...BTN_STYLES.continue, display: "none" },
          callback: () => this._continue(),
        }),
        button({
          id: `${this.id}-wait`,
          text: label ? "⏳ Wait" : "⏳",
          style: { ...BTN_STYLES.wait, display: "none" },
          callback: () => this._cancelWait(),
        }),
      ],
    });
  }

  private _syncButton(mode: Mode): void {
    const showGen = mode === "gen" || mode === "disabled";
    api.v1.ui.updateParts([
      {
        id: `${this.id}-gen`,
        style: {
          ...BTN_STYLES[showGen ? "gen" : "disabled"],
          display: showGen ? "block" : "none",
        },
        callback: () => this._generate(),
      },
      {
        id: `${this.id}-queue`,
        style: {
          ...BTN_STYLES.queue,
          display: mode === "queue" ? "block" : "none",
        },
        callback: () => this._cancel(),
      },
      {
        id: `${this.id}-cancel`,
        style: {
          ...BTN_STYLES.cancel,
          display: mode === "cancel" ? "block" : "none",
        },
        callback: () => this._cancelActive(),
      },
      {
        id: `${this.id}-continue`,
        style: {
          ...BTN_STYLES.continue,
          display: mode === "continue" ? "block" : "none",
        },
        callback: () => this._continue(),
      },
      {
        id: `${this.id}-wait`,
        style: {
          ...BTN_STYLES.wait,
          display: mode === "wait" ? "block" : "none",
        },
        callback: () => this._cancelWait(),
      },
    ]);
  }

  // ── Timer ─────────────────────────────────────────────────

  private _startTimer(endTime: number): void {
    const gen = ++this._timerGen;
    this._tickTimer(gen, endTime);
  }

  private _stopTimer(): void {
    this._timerGen++; // invalidates all in-flight ticks
  }

  private _tickTimer(gen: number, endTime: number): void {
    if (gen !== this._timerGen) return;
    const remaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
    this._updateTimerDisplay(remaining);
    if (remaining > 0) {
      void api.v1.timers.setTimeout(() => this._tickTimer(gen, endTime), 1000);
    }
  }

  private _updateTimerDisplay(remaining: number): void {
    if (this.options.variant === "icon") {
      api.v1.ui.updateParts([
        {
          id: this.id,
          text: `${remaining}`,
          iconId: undefined,
          style: ICON_STYLES.wait,
          callback: () => this._cancelWait(),
        },
      ]);
    } else {
      const label = this.options.label ?? "";
      api.v1.ui.updateParts([
        {
          id: `${this.id}-wait`,
          text: label ? `⏳ Wait (${remaining}s)` : `⏳ (${remaining}s)`,
        },
      ]);
    }
  }
}

// ── Convenience re-export for icon variant ───────────────────────────────────

export type SeGenerationIconButtonOptions = Omit<
  SeGenerationButtonOptions,
  "variant" | "label"
>;

export class SeGenerationIconButton extends SeGenerationButton {
  constructor(options: SeGenerationIconButtonOptions) {
    super({ ...options, variant: "icon" });
  }
}
