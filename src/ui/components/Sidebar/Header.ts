import { Component, createEvents } from "../../../../lib/nai-act";
import { RootState } from "../../../core/store/types";
import {
  segaToggled,
  storyCleared,
  uiClearConfirmToggled,
} from "../../../core/store/actions";

const { row, text, button } = api.v1.ui.part;

const events = createEvents({
    toggleSega: () => segaToggled(),
    toggleClearConfirm: () => uiClearConfirmToggled(),
    confirmClear: () => {
        storyCleared();
        uiClearConfirmToggled();
    }
});

export const Header: Component<{}, RootState> = {
    id: () => "kse-sidebar-header",

    describe(_, state) {
        const isSegaRunning = state?.runtime?.segaRunning || false;
        const showClearConfirm = state?.ui?.showClearConfirm || false;

        const titleAndSega = [
            text({ text: "🎭 Story Engine", style: { "font-weight": "bold" } }),
            button({
              text: "S.E.G.A.",
              iconId: isSegaRunning ? "fast-forward" : "play-circle",
              style: {
                padding: "4px 8px",
                "font-size": "0.8em",
                color: isSegaRunning ? "#ff9800" : undefined,
              },
              callback: events.toggleSega,
            }),
        ];

        let clearAction;
        if (showClearConfirm) {
            clearAction = row({
                style: { gap: "8px", "align-items": "center" },
                content: [
                  text({
                    text: "Clear?",
                    style: { color: "red", "font-weight": "bold" },
                  }),
                  button({
                    text: "Yes",
                    style: { color: "red", padding: "2px 8px" },
                    callback: events.confirmClear,
                  }),
                  button({
                    text: "No",
                    style: { padding: "2px 8px" },
                    callback: events.toggleClearConfirm,
                  }),
                ],
            });
        } else {
            clearAction = button({
                text: "Clear",
                iconId: "trash-2",
                style: { padding: "4px 8px", opacity: 0.7 },
                callback: events.toggleClearConfirm,
            });
        }

        return row({
            id: "kse-sidebar-header",
            style: {
              "justify-content": "space-between",
              "margin-bottom": "8px",
            },
            content: [...titleAndSega, clearAction],
        });
    },

    bind({ useSelector, updateParts }, props) {
        useSelector(
            state => ({
                segaRunning: state.runtime.segaRunning,
                showClearConfirm: state.ui.showClearConfirm
            }),
            (slice) => {
                const partialState = {
                    runtime: { segaRunning: slice.segaRunning },
                    ui: { showClearConfirm: slice.showClearConfirm }
                } as RootState;
                updateParts([Header.describe(props, partialState) as UIPart & { id: string }]);
            }
        );
    }
};
