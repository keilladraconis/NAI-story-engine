/**
 * SeBudgetFeedback — SUI replacement for BudgetFeedback.ts
 *
 * Shows a "Continue" button when GenX is waiting_for_user, and a countdown
 * timer when GenX is waiting_for_budget. Hidden otherwise.
 *
 * Store → component flow:
 *   StoreWatcher.watch() → setState({ show, timerEnd }) → onSync() → updateParts()
 * Timer countdown:
 *   Same generation-counter pattern as SeGenerationButton.
 */

import { SuiComponent, type SuiComponentOptions } from "nai-simple-ui";
import { store } from "../../core/store";
import { uiUserPresenceConfirmed } from "../../core/store";
import { StoreWatcher } from "../store-watcher";
import { colors } from "../theme";

// ── Types ────────────────────────────────────────────────────────────────────

type ShowMode = "none" | "continue" | "wait";

type SeBudgetFeedbackState = {
  show:     ShowMode;
  timerEnd: number;
};

type SeBudgetFeedbackTheme = {
  default: { self: { style: object } };
};

export type SeBudgetFeedbackOptions =
  SuiComponentOptions<SeBudgetFeedbackTheme, SeBudgetFeedbackState>;

// ── SeBudgetFeedback ─────────────────────────────────────────────────────────

export class SeBudgetFeedback extends SuiComponent<
  SeBudgetFeedbackTheme,
  SeBudgetFeedbackState,
  SeBudgetFeedbackOptions,
  UIPartRow
> {
  private readonly _watcher: StoreWatcher;
  private _timerGen = 0;

  // Child IDs
  private get _continueId(): string { return `${this.id}-continue`; }
  private get _waitId():     string { return `${this.id}-wait`; }

  constructor(options: SeBudgetFeedbackOptions) {
    super(
      { state: { show: "none", timerEnd: 0 }, ...options },
      { default: { self: { style: {} } } },
    );
    this._watcher = new StoreWatcher();
  }

  async compose(): Promise<UIPartRow> {
    this._watcher.watch(
      (s) => ({
        genxStatus:        s.runtime.genx.status,
        budgetWaitEndTime: s.runtime.genx.budgetWaitEndTime,
      }),
      async ({ genxStatus, budgetWaitEndTime }) => {
        let show: ShowMode = "none";
        if (genxStatus === "waiting_for_user")   show = "continue";
        if (genxStatus === "waiting_for_budget") show = "wait";
        await this.setState({
          show,
          timerEnd: budgetWaitEndTime ?? (Date.now() + 60000),
        });
      },
      (a, b) => a.genxStatus === b.genxStatus && a.budgetWaitEndTime === b.budgetWaitEndTime,
    );

    const { row, button, text } = api.v1.ui.part;
    return row({
      id:    this.id,
      style: { gap: "4px", "align-items": "center" },
      content: [
        button({
          id:       this._continueId,
          text:     "Continue",
          iconId:   "fast-forward" as IconId,
          style:    { display: "none", padding: "3px 8px", "font-size": "0.75em", background: colors.header, color: colors.darkBackground, "border-radius": "4px", "font-weight": "bold" },
          callback: () => { store.dispatch(uiUserPresenceConfirmed()); },
        }),
        text({
          id:    this._waitId,
          text:  "",
          style: { display: "none", "font-size": "0.75em", color: colors.paragraph, opacity: "0.7" },
        }),
      ],
    });
  }

  override async onSync(): Promise<void> {
    const { show, timerEnd } = this.state;

    api.v1.ui.updateParts([
      { id: this._continueId, style: show === "continue"
          ? { display: "block", padding: "3px 8px", "font-size": "0.75em", background: colors.header, color: colors.darkBackground, "border-radius": "4px", "font-weight": "bold" }
          : { display: "none" } },
      { id: this._waitId, style: show === "wait"
          ? { display: "block", "font-size": "0.75em", color: colors.paragraph, opacity: "0.7" }
          : { display: "none" } },
    ]);

    if (show === "wait") {
      this._startTimer(timerEnd);
    } else {
      this._stopTimer();
    }
  }

  // ── Timer ──────────────────────────────────────────────────

  private _startTimer(endTime: number): void {
    const gen = ++this._timerGen;
    this._tick(gen, endTime);
  }

  private _stopTimer(): void {
    this._timerGen++;
  }

  private _tick(gen: number, endTime: number): void {
    if (gen !== this._timerGen) return;
    const remaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
    api.v1.ui.updateParts([{ id: this._waitId, text: `Wait (${remaining}s)` }]);
    if (remaining > 0) {
      void api.v1.timers.setTimeout(() => this._tick(gen, endTime), 1000);
    }
  }
}
