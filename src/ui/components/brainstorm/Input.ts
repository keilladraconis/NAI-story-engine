import { Component, createEvents } from "../../../../lib/nai-act";
import { RootState } from "../../../core/store/types";
import { IDS } from "../../framework/ids";
import {
  messagesCleared,
  uiBrainstormSubmitUserMessage,
} from "../../../core/store";
import { GenerationButton } from "../GenerationButton";

const { column, row, button, multilineTextInput } = api.v1.ui.part;

const STYLES = {
  SEND_BTN: { flex: 0.7 },
};

const events = createEvents<
  {},
  {
    submit(): void;
    clear(): void;
  }
>();

export const Input: Component<{}, RootState> = {
  id: () => `${IDS.BRAINSTORM.INPUT}-area`,
  events,

  describe(props) {
    const ids = IDS.BRAINSTORM;

    // Use GenerationButton describe
    const btnSend = GenerationButton.describe({
      id: ids.SEND_BTN,
      label: "Send",
      style: STYLES.SEND_BTN,
      generateAction: uiBrainstormSubmitUserMessage(),
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

  onMount(_props, ctx) {
    const { dispatch, useSelector, mount } = ctx;
    const ids = IDS.BRAINSTORM;

    // Mount GenerationButton logic
    mount(GenerationButton, {
      id: ids.SEND_BTN,
      label: "Send",
      style: STYLES.SEND_BTN,
      generateAction: uiBrainstormSubmitUserMessage(),
    });

    events.attach({
      submit() {
        dispatch(uiBrainstormSubmitUserMessage());
      },
      clear() {
        dispatch(messagesCleared());
      },
    });

    // Reactive State: Only handle Input disabled state
    useSelector(
      (state) => ({
        status: state.runtime.genx.status,
      }),
      ({ status }) => {
        const isGenerating = status === "generating";

        api.v1.ui.updateParts([
          {
            id: ids.INPUT,
            disabled: isGenerating,
          },
        ]);
      },
    );
  },
};
