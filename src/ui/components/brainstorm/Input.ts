import { Component, createEvents } from "../../../../lib/nai-act";
import { RootState } from "../../../core/store/types";
import { IDS } from "../../framework/ids";
import {
  messagesCleared,
  uiBrainstormSubmitUserMessage,
} from "../../../core/store";
import { GenerationButton } from "../GenerationButton";
import { ButtonWithConfirmation } from "../ButtonWithConfirmation";

const { column, row, multilineTextInput } = api.v1.ui.part;

const STYLES = {
  SEND_BTN: { flex: "0.7" },
  CLEAR_BTN: { flex: "0.3" },
};

const events = createEvents<
  {},
  {
    submit(): void;
  }
>();

export const Input: Component<{}, RootState> = {
  id: () => `${IDS.BRAINSTORM.INPUT}-area`,
  events,

  describe(props) {
    const ids = IDS.BRAINSTORM;

    const btnClear = ButtonWithConfirmation.describe({
      id: `${ids.INPUT}-btn-clear`,
      label: "Clear",
      confirmLabel: "Clear?",
      style: STYLES.CLEAR_BTN,
      onConfirm: () => { },
    });

    const btnSend = GenerationButton.describe({
      id: ids.SEND_BTN,
      label: "Send",
      style: STYLES.SEND_BTN,
      generateAction: uiBrainstormSubmitUserMessage(),
      // Track only brainstorm-type requests, not global generation status
      stateProjection: (state) => {
        // Find any brainstorm request (active or queued)
        if (state.runtime.activeRequest?.type === "brainstorm") {
          return state.runtime.activeRequest.id;
        }
        const queuedBrainstorm = state.runtime.queue.find(
          (r) => r.type === "brainstorm"
        );
        return queuedBrainstorm?.id;
      },
      requestIdFromProjection: (projection) => projection,
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
          content: [btnClear, btnSend],
        }),
      ],
    });
  },

  onMount(_props, ctx) {
    const { dispatch, useSelector, mount } = ctx;
    const ids = IDS.BRAINSTORM;

    // Mount ButtonWithConfirmation for Clear button
    mount(ButtonWithConfirmation, {
      id: `${ids.INPUT}-btn-clear`,
      label: "Clear",
      confirmLabel: "Clear?",
      style: STYLES.CLEAR_BTN,
      onConfirm: () => dispatch(messagesCleared()),
    });

    // Mount GenerationButton logic
    mount(GenerationButton, {
      id: ids.SEND_BTN,
      label: "Send",
      style: STYLES.SEND_BTN,
      generateAction: uiBrainstormSubmitUserMessage(),
      // Track only brainstorm-type requests, not global generation status
      stateProjection: (state) => {
        // Find any brainstorm request (active or queued)
        if (state.runtime.activeRequest?.type === "brainstorm") {
          return state.runtime.activeRequest.id;
        }
        const queuedBrainstorm = state.runtime.queue.find(
          (r) => r.type === "brainstorm"
        );
        return queuedBrainstorm?.id;
      },
      requestIdFromProjection: (projection) => projection,
    });

    events.attach({
      submit() {
        dispatch(uiBrainstormSubmitUserMessage());
      },
    });

    // Reactive State: Only handle Input disabled state
    // Only disable when brainstorm is actively generating, not other generation types
    useSelector(
      (state) => ({
        activeRequest: state.runtime.activeRequest,
        genxStatus: state.runtime.genx.status,
      }),
      ({ activeRequest, genxStatus }) => {
        const isBrainstormGenerating =
          activeRequest?.type === "brainstorm" && genxStatus === "generating";

        api.v1.ui.updateParts([
          {
            id: ids.INPUT,
            disabled: isBrainstormGenerating,
          },
        ]);
      },
    );
  },
};
