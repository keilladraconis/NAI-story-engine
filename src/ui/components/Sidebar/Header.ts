import {
  BindContext,
  createEvents,
  defineComponent,
} from "../../../../lib/nai-act";
import { RootState } from "../../../core/store/types";
import { segaToggled } from "../../../core/store/slices/runtime";
import { storyCleared } from "../../../core/store/slices/story";
import { ButtonWithConfirmation } from "../ButtonWithConfirmation";

const { row, text, button } = api.v1.ui.part;

type HeaderEvents = {
  toggleSega(): void;
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
  },

  describe(_props: {}) {
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
        // Clear button (right)
        ButtonWithConfirmation.describe({
          id: "header-clear",
          label: "Clear",
          confirmLabel: "Clear?",
          buttonStyle: { padding: "4px 8px", opacity: 0.7 },
          onConfirm: () => {},
        }),
      ],
    });
  },

  onMount(_props: {}, ctx: BindContext<RootState>) {
    const { useSelector, dispatch, mount } = ctx;

    this.events.attach({
      toggleSega: () => dispatch(segaToggled()),
    });

    // Mount ButtonWithConfirmation for Clear button
    mount(ButtonWithConfirmation, {
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
            text: unit.substring(marquee.position) + unit.substring(0, marquee.position),
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

    useSelector(
      (state) => ({
        segaRunning: state.runtime.segaRunning,
        statusText: state.runtime.sega.statusText,
      }),
      ({ segaRunning, statusText }) => {
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

        // Marquee control
        if (statusText) {
          if (statusText !== marquee.text) {
            marquee.text = statusText;
            marquee.position = 0;
          }
          if (!marquee.running) {
            marquee.running = true;
            runMarquee();
          }
        } else {
          marquee.running = false;
          marquee.text = "";
          api.v1.ui.updateParts([
            {
              id: "header-sega-status",
              text: "",
            },
          ]);
        }
      },
    );
  },
});
