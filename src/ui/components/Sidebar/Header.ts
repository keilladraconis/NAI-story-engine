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

    useSelector(
      (state) => ({
        segaRunning: state.runtime.segaRunning,
      }),
      ({ segaRunning }) => {
        api.v1.ui.updateParts([
          {
            id: "header-sega-start-btn",
            style: { display: segaRunning ? "none" : "block" },
          },
          {
            id: "header-sega-stop-btn",
            style: { display: segaRunning ? "block" : "none" },
          },
        ]);
      },
    );
  },
});
