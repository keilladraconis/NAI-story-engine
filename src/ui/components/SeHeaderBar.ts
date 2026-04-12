/**
 * SeHeaderBar — SUI replacement for Header.ts (nai-act).
 *
 * Row containing:
 *   - S.E.G.A. start / stop buttons (toggled via StoreWatcher)
 *   - Status text with marquee animation during SEGA
 *   - Continue button (shown when genx waiting for user)
 *   - Wait countdown text (shown when genx waiting for budget)
 *   - Clear story button (SuiConfirmButton — no SeConfirmButton wrapper needed)
 *
 * Timer machinery uses api.v1.timers — no setTimeout, no DOM.
 */

import {
  SuiComponent,
  SuiConfirmButton,
  type SuiComponentOptions,
} from "nai-simple-ui";
import { store } from "../../core/store";
import { uiUserPresenceConfirmed } from "../../core/store/slices/ui";
import { storyCleared } from "../../core/store/slices/story";
import { StoreWatcher } from "../store-watcher";
import { colors } from "../theme";
import { IDS } from "../framework/ids";
import { SeImportWizard } from "./SeImportWizard";
import type { EditPaneHost } from "./SeContentWithTitlePane";

type SeHeaderBarTheme = { default: { self: { style: object } } };
type SeHeaderBarState = Record<string, never>;

export type SeHeaderBarOptions = {
  editHost: EditPaneHost;
} & SuiComponentOptions<SeHeaderBarTheme, SeHeaderBarState>;

const BTN_STYLE = { padding: "4px 8px", "font-size": "0.8em" };
const CONTINUE_STYLE = {
  ...BTN_STYLE,
  background: colors.header,
  color: colors.darkBackground,
};
const STATUS_STYLE = {
  flex: "1",
  "font-size": "0.8em",
  opacity: "0.8",
  overflow: "hidden",
  "white-space": "nowrap",
};
const WAIT_STYLE = { flex: "1", "font-size": "0.8em", opacity: "0.8" };

export class SeHeaderBar extends SuiComponent<
  SeHeaderBarTheme,
  SeHeaderBarState,
  SeHeaderBarOptions,
  UIPartRow
> {
  private readonly _watcher: StoreWatcher;
  private readonly _clearBtn: SuiConfirmButton;

  // Marquee state
  private _marqueeRunning = false;
  private _marqueeText = "";
  private _marqueePosition = 0;

  // Wait timer state
  private _waitTimerActive = false;
  private _waitTimerId: number | undefined;

  constructor(options: SeHeaderBarOptions) {
    super(
      { state: {} as SeHeaderBarState, ...options },
      { default: { self: { style: {} } } },
    );

    this._watcher = new StoreWatcher();

    this._clearBtn = new SuiConfirmButton({
      id: "header-clear",
      onConfirm: async () => {
        store.dispatch(storyCleared());
      },
      timeout: 4000,
      theme: {
        default: {
          self: { text: "Clear", style: { ...BTN_STYLE, opacity: "0.7" } },
        },
        pending: {
          self: {
            text: "Clear?",
            iconId: "alertTriangle" as IconId,
            style: {
              ...BTN_STYLE,
              color: colors.warning,
              "font-weight": "bold",
            },
          },
        },
      },
    });
  }

  private async _runMarquee(): Promise<void> {
    const SPEED = 180;
    const PAUSE = 3000;

    await api.v1.timers.sleep(PAUSE);

    while (this._marqueeRunning && this._marqueeText) {
      const gapSize = Math.max(5, Math.ceil(this._marqueeText.length / 3));
      const unit = this._marqueeText + " ".repeat(gapSize);

      api.v1.ui.updateParts([
        {
          id: "header-sega-status",
          text:
            unit.slice(this._marqueePosition) +
            unit.slice(0, this._marqueePosition),
        },
      ]);

      const next = (this._marqueePosition + 1) % unit.length;
      await api.v1.timers.sleep(next === 0 ? PAUSE : SPEED);
      this._marqueePosition = next;
    }
  }

  private _updateWaitTimer(endTime: number): void {
    if (!this._waitTimerActive) return;
    const remaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
    api.v1.ui.updateParts([
      { id: "header-wait-text", text: `Wait (${remaining}s)` },
    ]);
    if (remaining > 0) {
      void api.v1.timers
        .setTimeout(() => {
          this._updateWaitTimer(endTime);
        }, 1000)
        .then((tid: number) => {
          if (this._waitTimerActive) this._waitTimerId = tid;
          else api.v1.timers.clearTimeout(tid);
        });
    }
  }

  async compose(): Promise<UIPartRow> {
    const { row, text, button } = api.v1.ui.part;

    this._watcher.dispose();
    this._watcher.watch(
      (s) => ({
        statusText: s.runtime.sega.statusText,
        genxStatus: s.runtime.genx.status,
        budgetWaitEndTime: s.runtime.genx.budgetWaitEndTime,
      }),
      ({ statusText, genxStatus, budgetWaitEndTime }) => {
        const showContinue = genxStatus === "waiting_for_user";
        const showWait = genxStatus === "waiting_for_budget";
        const showMarquee = !showContinue && !showWait;

        api.v1.ui.updateParts([
          {
            id: "header-continue-btn",
            style: {
              ...CONTINUE_STYLE,
              display: showContinue ? "flex" : "none",
            },
          },
          {
            id: "header-wait-text",
            style: { ...WAIT_STYLE, display: showWait ? "flex" : "none" },
          },
          {
            id: "header-sega-status",
            style: { ...STATUS_STYLE, display: showMarquee ? "block" : "none" },
          },
        ]);

        if (showWait) {
          if (!this._waitTimerActive) {
            this._waitTimerActive = true;
            const endTime = budgetWaitEndTime || Date.now() + 60000;
            api.v1.ui.updateParts([
              {
                id: "header-wait-text",
                text: `Wait (${Math.max(0, Math.ceil((endTime - Date.now()) / 1000))}s)`,
              },
            ]);
            this._updateWaitTimer(endTime);
          }
        } else {
          this._waitTimerActive = false;
          if (this._waitTimerId !== undefined) {
            api.v1.timers.clearTimeout(this._waitTimerId);
            this._waitTimerId = undefined;
          }
        }

        if (showMarquee && statusText) {
          if (statusText !== this._marqueeText) {
            this._marqueeText = statusText;
            this._marqueePosition = 0;
          }
          if (!this._marqueeRunning) {
            this._marqueeRunning = true;
            void this._runMarquee();
          }
        } else {
          this._marqueeRunning = false;
          this._marqueeText = "";
          if (showMarquee) {
            api.v1.ui.updateParts([{ id: "header-sega-status", text: "" }]);
          }
        }
      },
      (a, b) =>
        a.statusText === b.statusText &&
        a.genxStatus === b.genxStatus &&
        a.budgetWaitEndTime === b.budgetWaitEndTime,
    );

    const clearPart = await this._clearBtn.build();

    return row({
      id: "kse-sidebar-header",
      style: {
        "justify-content": "space-between",
        "margin-bottom": "8px",
        "align-items": "center",
        gap: "8px",
      },
      content: [
        text({ id: "header-sega-status", text: "", style: STATUS_STYLE }),
        button({
          id: "header-continue-btn",
          text: "Continue",
          iconId: "fast-forward" as IconId,
          style: { ...CONTINUE_STYLE, display: "none" },
          callback: () => {
            store.dispatch(uiUserPresenceConfirmed());
          },
        }),
        text({
          id: "header-wait-text",
          text: "",
          style: { ...WAIT_STYLE, display: "none" },
        }),
        button({
          id: "header-import-btn",
          text: "Import",
          iconId: "download" as IconId,
          style: { ...BTN_STYLE, opacity: "0.7" },
          callback: () => {
            this.options.editHost.open(
              new SeImportWizard({ id: IDS.IMPORT.WIZARD, editHost: this.options.editHost }),
            );
          },
        }),
        clearPart,
      ],
    });
  }
}
