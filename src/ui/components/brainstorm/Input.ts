import { Component } from "../../../../lib/nai-act";
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

export const Input: Component<{}, RootState> = {
  id: () => `${IDS.BRAINSTORM.INPUT}-area`,

  build(_props, ctx) {
    const { dispatch, useSelector } = ctx;
    const ids = IDS.BRAINSTORM;

    // Render child components
    const { part: clearBtn } = ctx.render(ButtonWithConfirmation, {
      id: `${ids.INPUT}-btn-clear`,
      label: "Clear",
      confirmLabel: "Clear?",
      style: STYLES.CLEAR_BTN,
      onConfirm: () => dispatch(messagesCleared()),
    });

    const { part: sendBtn } = ctx.render(GenerationButton, {
      id: ids.SEND_BTN,
      label: "Send",
      style: STYLES.SEND_BTN,
      generateAction: uiBrainstormSubmitUserMessage(),
      stateProjection: (state) => {
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

    const submit = () => dispatch(uiBrainstormSubmitUserMessage());

    // Reactive State: Only handle Input disabled state
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

    return column({
      content: [
        multilineTextInput({
          id: ids.INPUT,
          placeholder: "Type an idea...",
          storageKey: `story:${ids.INPUT}`,
          style: { "min-height": "60px", "max-height": "120px" },
          onSubmit: submit,
        }),
        row({
          id: `${ids.INPUT}-btn-row`,
          style: { gap: "8px", "margin-top": "8px" },
          content: [clearBtn, sendBtn],
        }),
      ],
    });
  },
};
