import { BindContext, createEvents, defineComponent } from "../../../../lib/nai-act";
import { RootState } from "../../../core/store/types";
import { segaToggled } from "../../../core/store/slices/runtime";
import { uiClearConfirmToggled } from "../../../core/store/slices/ui";
import { storyCleared } from "../../../core/store/slices/story";
import { NAI_WARNING } from "../../../ui/colors";

const { row, text, button } = api.v1.ui.part;

type HeaderEvents = {
  toggleSega(): void;
  toggleClearConfirm(): void;
  confirmClear(): void;
};

export const Header = defineComponent({
  id: () => "kse-sidebar-header",
  events: createEvents<{}, HeaderEvents>(),

  describe(_props: {}) {
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
              callback: () => this.events.toggleSega({}),
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
              callback: () => this.events.toggleSega({}),
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
              callback: () => this.events.toggleClearConfirm({}),
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
                  callback: () => this.events.confirmClear({}),
                }),
                button({
                  id: "header-confirm-no",
                  text: "No",
                  style: { padding: "2px 8px" },
                  callback: () => this.events.toggleClearConfirm({}),
                }),
              ],
            }),
          ],
        }),
      ],
    });
  },

  onMount(_props: {}, ctx: BindContext<RootState>) {
    const { useSelector, dispatch } = ctx;

    this.events.attach({
      toggleSega: () => dispatch(segaToggled()),
      toggleClearConfirm: () => dispatch(uiClearConfirmToggled()),
      confirmClear: () => {
        dispatch(storyCleared());
        dispatch(uiClearConfirmToggled());
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
});
