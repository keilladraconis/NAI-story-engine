import { Component, createEvents } from "../../../../lib/nai-act";
import { RootState } from "../../../core/store/types";
import { IDS } from "../../framework/ids";
import { messagesCleared, uiBrainstormSubmitUserMessage, uiRequestCancellation } from "../../../core/store";
import { NAI_WARNING } from "../../colors";

const { column, row, button, multilineTextInput } = api.v1.ui.part;

const STYLES = {
  SEND_BTN: { flex: 0.7 },
};

const events = createEvents<{}, {
  submit(): void;
  clear(): void;
  cancel(): void;
}>();

export const Input: Component<{}, RootState> = {
  id: () => `${IDS.BRAINSTORM.INPUT}-area`,
  events,

  describe(props) {
    const ids = IDS.BRAINSTORM;

    // Inline Send Button
    const btnSend = button({
      id: ids.SEND_BTN,
      text: "⚡ Send",
      style: { ...STYLES.SEND_BTN, "font-weight": "bold" },
      callback: () => events.submit(props),
    });

    return column({
      content: [
        multilineTextInput({
          id: ids.INPUT,
          placeholder: "Type an idea...",
          storageKey: `story:${ids.INPUT}`,
          style: { "min-height": "60px", "max-height": "120px" },
          onSubmit: () => events.submit(props),
        }),
        row({
          style: { gap: "8px", "margin-top": "8px" },
          content: [
            button({
              id: `${ids.INPUT}-btn-clear`,
              text: "Clear",
              style: { flex: 0.3 },
              callback: () => events.clear(props),
            }),
            btnSend,
          ],
        }),
      ],
    });
  },

  onMount(props, ctx) {
    const { dispatch, useSelector, getState } = ctx;
    const ids = IDS.BRAINSTORM;

    events.attach({
      submit() {
        const status = getState().runtime.genx.status;
        if (status === "generating" || status === "queued") {
           dispatch(uiRequestCancellation());
        } else {
           dispatch(uiBrainstormSubmitUserMessage());
        }
      },
      clear() {
        dispatch(messagesCleared());
      },
    });

    // Reactive State: Update Button & Input
    useSelector(
      (state) => ({
        status: state.runtime.genx.status,
      }),
      ({ status }) => {
        const isGenerating = status === "generating";
        const isQueued = status === "queued";

        // Determine Button State
        let btnText = "⚡ Send";
        let btnStyle: any = { ...STYLES.SEND_BTN, "font-weight": "bold", display: "block" };

        if (isGenerating) {
          btnText = "🚫 Cancel";
          btnStyle = { ...STYLES.SEND_BTN, "font-weight": "bold", background: NAI_WARNING, color: "#1f1f1f" };
        } else if (isQueued) {
            btnText = "⏳ Queued";
            btnStyle = { ...STYLES.SEND_BTN, "background-color": "#e2e3e5", color: "#383d41" };
        }

        api.v1.ui.updateParts([
          {
            id: ids.INPUT,
            disabled: isGenerating,
          },
          {
            id: ids.SEND_BTN,
            text: btnText,
            style: btnStyle,
          }
        ]);
      }
    );
  },
};
