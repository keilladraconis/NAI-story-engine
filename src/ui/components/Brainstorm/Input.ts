import { Component, createEvents } from "../../../../lib/nai-act";
import { BrainstormActions } from "./types";
import { IDS } from "../../framework/ids";
import { RootState } from "../../../core/store/types";

export interface InputProps {
  actions: BrainstormActions;
}

const { column, row, button, multilineTextInput } = api.v1.ui.part;

const STYLES = {
  SEND_BTN: { flex: 0.7 },
  CANCEL_BTN: { flex: 0.7, "background-color": "#ffcccc", color: "red" },
};

const events = createEvents({
  submit: (props: InputProps) => props.actions.onSubmit(),
  clear: (props: InputProps) => props.actions.onClear(),
  cancel: (props: InputProps) => props.actions.onCancelRequest(),
});

export const Input: Component<InputProps, RootState> = {
  id: () => `${IDS.BRAINSTORM.INPUT}-area`,

  describe(props) {
    const ids = IDS.BRAINSTORM;

    return column({
      id: `${ids.INPUT}-area`,
      content: [
        multilineTextInput({
          id: ids.INPUT,
          placeholder: "Type an idea...",
          storageKey: `story:${ids.INPUT}`,
          onSubmit: () => events.submit(props),
          style: { "min-height": "60px", "max-height": "120px" },
        }),
        row({
          id: `${ids.INPUT}-controls`,
          style: { gap: "8px", "margin-top": "8px" },
          content: [
            button({
              id: ids.CLEAR_BTN,
              text: "Clear",
              style: { flex: 0.3 },
              callback: () => events.clear(props),
            }),
            button({
              id: ids.SEND_BTN,
              text: "Send",
              style: STYLES.SEND_BTN,
              callback: () => events.submit(props),
            }),
            button({
              id: ids.CANCEL_BTN,
              text: "🚫 Cancel",
              // Initially hidden
              style: { ...STYLES.CANCEL_BTN, display: "none" },
              callback: () => events.cancel(props),
            }),
          ],
        }),
      ],
    });
  },

  bind({ useSelector, updateParts }, props) {
    const ids = IDS.BRAINSTORM;

    // Watch Generation State
    useSelector(
      (state) => {
        const genId = "gen-brainstorm";
        const request =
          state.runtime.queue.find((r) => r.id === genId) ||
          state.runtime.activeRequest;
        return !!request;
      },
      (isGenerating) => {
        updateParts([
          {
            id: ids.INPUT,
            disabled: isGenerating,
          },
          {
            id: ids.SEND_BTN,
            style: isGenerating
              ? { ...STYLES.SEND_BTN, display: "none" }
              : STYLES.SEND_BTN,
          },
          {
            id: ids.CANCEL_BTN,
            style: isGenerating
              ? STYLES.CANCEL_BTN
              : { ...STYLES.CANCEL_BTN, display: "none" },
          },
        ]);
      },
    );
  },
};
