import { Component, createEvents } from "../../../../lib/nai-act";
import { RootState } from "../../../core/store/types";
import { segaToggled } from "../../../core/store/slices/runtime";
import { uiClearConfirmToggled } from "../../../core/store/slices/ui";
import { storyCleared } from "../../../core/store/slices/story";
import { NAI_WARNING } from "../../../ui/colors";

const { row, text, button } = api.v1.ui.part;

// Define event signature
type HeaderEvents = {
  toggleSega(dispatch: any): void;
  toggleClearConfirm(dispatch: any): void;
  confirmClear(dispatch: any): void;
};

const events = createEvents<{}, HeaderEvents>();

export const Header: Component<{}, RootState> = {
  id: () => "kse-sidebar-header",
  events: undefined,

  describe(props) {
    return row({
      id: "kse-sidebar-header",
      style: {
        "justify-content": "space-between",
        "margin-bottom": "8px",
        "align-items": "center",
      },
      content: [
        row({
          style: { gap: "8px", "align-items": "center" },
          content: [
            text({ text: "🎭 Story Engine", style: { "font-weight": "bold" } }),
            button({
              id: "header-sega-start-btn",
              text: "S.E.G.A.",
              iconId: "play-circle",
              style: { padding: "4px 8px", "font-size": "0.8em" },
              callback: () => events.toggleSega(props, null),
            }),
            button({
              id: "header-sega-stop-btn",
              text: "S.E.G.A.",
              iconId: "fast-forward",
              style: {
                padding: "4px 8px",
                "font-size": "0.8em",
                color: "#ff9800",
                display: "none",
              },
              callback: () => events.toggleSega(props, null),
            }),
          ],
        }),
        row({
          style: { gap: "4px", "align-items": "center" },
          content: [
            button({
              id: "header-clear-btn",
              text: "Clear",
              iconId: "trash-2",
              style: { padding: "4px 8px", opacity: 0.7 },
              callback: () => events.toggleClearConfirm(props, null),
            }),
            row({
              id: "header-clear-confirm",
              style: { gap: "4px", "align-items": "center", display: "none" },
              content: [
                text({
                  text: "Clear?",
                  style: { color: NAI_WARNING, "font-weight": "bold" },
                }),
                button({
                  id: "header-confirm-yes",
                  text: "Yes",
                  style: { color: NAI_WARNING, padding: "2px 8px" },
                  callback: () => events.confirmClear(props, null),
                }),
                button({
                  id: "header-confirm-no",
                  text: "No",
                  style: { padding: "2px 8px" },
                  callback: () => events.toggleClearConfirm(props, null),
                }),
              ],
            }),
          ],
        }),
      ],
    });
  },

  onMount(_, { useSelector }) {
    // Attach event handlers
    events.attach({
      toggleSega: (_p, d) => d(segaToggled()),
      toggleClearConfirm: (_p, d) => d(uiClearConfirmToggled()),
      confirmClear: (_p, d) => {
        d(storyCleared());
        d(uiClearConfirmToggled());
      },
    });

    useSelector(
      (state) => ({
        segaRunning: state.runtime.segaRunning,
        showClearConfirm: state.ui.showClearConfirm,
      }),
      ({ segaRunning, showClearConfirm }) => {
        api.v1.ui.updateParts([
          {
            id: "header-sega-start-btn",
            style: { display: segaRunning ? "none" : "block" },
          },
          {
            id: "header-sega-stop-btn",
            style: { display: segaRunning ? "block" : "none" },
          },
          {
            id: "header-clear-btn",
            style: { display: showClearConfirm ? "none" : "block" },
          },
          {
            id: "header-clear-confirm",
            style: { display: showClearConfirm ? "flex" : "none" },
          },
        ]);
      },
    );
  },
};
