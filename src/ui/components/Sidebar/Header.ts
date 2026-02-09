import {
  BindContext,
  createEvents,
  defineComponent,
} from "../../../../lib/nai-act";
import { RootState } from "../../../core/store/types";
import { segaToggled } from "../../../core/store/slices/runtime";
import { uiUserPresenceConfirmed } from "../../../core/store/slices/ui";
import { storyCleared } from "../../../core/store/slices/story";
import { ButtonWithConfirmation } from "../ButtonWithConfirmation";
import { NAI_HEADER, NAI_FOREGROUND } from "../../colors";

const { row, text, button } = api.v1.ui.part;

type HeaderEvents = {
  toggleSega(): void;
  continueGeneration(): void;
};

export const Header = defineComponent({
  id: () => "kse-sidebar-header",
  events: createEvents<{}, HeaderEvents>(),

  styles: {
    mainRow: {
      "justify-content": "space-between",
      "margin-bottom": "8px",
      "align-items": "center",
      gap: "8px",
    },
    actionButton: { padding: "4px 8px", "font-size": "0.8em" },
    stopButton: { padding: "4px 8px", "font-size": "0.8em", color: "#ff9800" },
    statusText: {
      flex: "1",
      "font-size": "0.8em",
      opacity: "0.8",
      overflow: "hidden",
      "white-space": "nowrap",
    },
    hidden: { display: "none" },
    visible: { display: "block" },
    continueButton: {
      padding: "4px 8px",
      "font-size": "0.8em",
      background: NAI_HEADER,
      color: NAI_FOREGROUND,
    },
    waitText: {
      flex: "1",
      "font-size": "0.8em",
      opacity: "0.8",
    },
  },

  build(_props: {}, ctx: BindContext<RootState>) {
    const { useSelector, dispatch } = ctx;

    this.events.attach({
      toggleSega: () => dispatch(segaToggled()),
      continueGeneration: () => dispatch(uiUserPresenceConfirmed()),
    });

    // Render ButtonWithConfirmation for Clear button
    const { part: clearBtn } = ctx.render(ButtonWithConfirmation, {
      id: "header-clear",
      label: "Clear",
      confirmLabel: "Clear?",
      buttonStyle: { padding: "4px 8px", opacity: 0.7 },
      onConfirm: () => dispatch(storyCleared()),
    });

    // Marquee state
    const marquee = {
      running: false,
      text: "",
      position: 0,
    };

    const runMarquee = async () => {
      const SPEED = 180;
      const PAUSE = 3000;

      // Initial pause before scrolling starts
      await api.v1.timers.sleep(PAUSE);

      while (marquee.running && marquee.text) {
        // Gap is 1/3 of text length, minimum 5 spaces
        const gapSize = Math.max(5, Math.ceil(marquee.text.length / 3));
        const gap = " ".repeat(gapSize);
        const unit = marquee.text + gap;

        api.v1.ui.updateParts([
          {
            id: "header-sega-status",
            text:
              unit.substring(marquee.position) +
              unit.substring(0, marquee.position),
          },
        ]);

        const nextPosition = (marquee.position + 1) % unit.length;

        // Pause at the start of each cycle
        if (nextPosition === 0) {
          await api.v1.timers.sleep(PAUSE);
        } else {
          await api.v1.timers.sleep(SPEED);
        }

        marquee.position = nextPosition;
      }
    };

    // Continue/Wait timer state
    let waitTimerId: any = null;
    let isWaitTimerActive = false;

    const updateWaitTimer = (endTime: number) => {
      if (!isWaitTimerActive) return;

      const now = Date.now();
      const remaining = Math.max(0, Math.ceil((endTime - now) / 1000));

      api.v1.ui.updateParts([
        { id: "header-wait-text", text: `Wait (${remaining}s)` },
      ]);

      if (remaining > 0) {
        api.v1.timers
          .setTimeout(() => updateWaitTimer(endTime), 1000)
          .then((tid: any) => {
            if (isWaitTimerActive) {
              waitTimerId = tid;
            } else {
              api.v1.timers.clearTimeout(tid);
            }
          });
      }
    };

    useSelector(
      (state) => ({
        segaRunning: state.runtime.segaRunning,
        statusText: state.runtime.sega.statusText,
        genxStatus: state.runtime.genx.status,
        budgetWaitEndTime: state.runtime.genx.budgetWaitEndTime,
      }),
      ({ segaRunning, statusText, genxStatus, budgetWaitEndTime }) => {
        api.v1.ui.updateParts([
          {
            id: "header-sega-start-btn",
            style: this.style?.(
              "actionButton",
              segaRunning ? "hidden" : "visible",
            ),
          },
          {
            id: "header-sega-stop-btn",
            style: this.style?.(
              "stopButton",
              segaRunning ? "visible" : "hidden",
            ),
          },
        ]);

        // Continue/Wait widget control
        const showContinue = genxStatus === "waiting_for_user";
        const showWait = genxStatus === "waiting_for_budget";
        const showMarquee = !showContinue && !showWait;

        api.v1.ui.updateParts([
          {
            id: "header-continue-btn",
            style: this.style?.(
              "continueButton",
              showContinue ? "visible" : "hidden",
            ),
          },
          {
            id: "header-wait-text",
            style: this.style?.(
              "waitText",
              showWait ? "visible" : "hidden",
            ),
          },
          {
            id: "header-sega-status",
            style: this.style?.(
              "statusText",
              showMarquee ? "visible" : "hidden",
            ),
          },
        ]);

        // Wait countdown timer
        if (showWait) {
          if (!isWaitTimerActive) {
            isWaitTimerActive = true;
            const endTime = budgetWaitEndTime || Date.now() + 60000;
            const initialRemaining = Math.max(
              0,
              Math.ceil((endTime - Date.now()) / 1000),
            );
            api.v1.ui.updateParts([
              { id: "header-wait-text", text: `Wait (${initialRemaining}s)` },
            ]);
            updateWaitTimer(endTime);
          }
        } else {
          isWaitTimerActive = false;
          if (waitTimerId) {
            api.v1.timers.clearTimeout(waitTimerId);
            waitTimerId = null;
          }
        }

        // Marquee control
        if (showMarquee && statusText) {
          if (statusText !== marquee.text) {
            marquee.text = statusText;
            marquee.position = 0;
          }
          if (!marquee.running) {
            marquee.running = true;
            runMarquee();
          }
        } else if (!statusText || !showMarquee) {
          marquee.running = false;
          marquee.text = "";
          if (showMarquee) {
            api.v1.ui.updateParts([
              {
                id: "header-sega-status",
                text: "",
              },
            ]);
          }
        }
      },
    );

    return row({
      id: "kse-sidebar-header",
      style: this.style?.("mainRow"),
      content: [
        // SEGA buttons (left)
        row({
          content: [
            button({
              id: "header-sega-start-btn",
              text: "S.E.G.A.",
              iconId: "play-circle",
              style: this.style?.("actionButton"),
              callback: () => this.events.toggleSega({}),
            }),
            button({
              id: "header-sega-stop-btn",
              text: "S.E.G.A.",
              iconId: "fast-forward",
              style: this.style?.("stopButton", "hidden"),
              callback: () => this.events.toggleSega({}),
            }),
          ],
        }),
        // Status text (center)
        text({
          id: "header-sega-status",
          text: "",
          style: this.style?.("statusText"),
        }),
        // Continue button (center, hidden by default)
        button({
          id: "header-continue-btn",
          text: "Continue",
          iconId: "fast-forward",
          style: this.style?.("continueButton", "hidden"),
          callback: () => this.events.continueGeneration({}),
        }),
        // Wait countdown (center, hidden by default)
        text({
          id: "header-wait-text",
          text: "",
          style: this.style?.("waitText", "hidden"),
        }),
        // Clear button (directly composed)
        clearBtn,
      ],
    });
  },
});
