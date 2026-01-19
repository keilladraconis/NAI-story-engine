import { Component, createEvents } from "../../../../lib/nai-act";
import { BrainstormActions } from "./types";
import { IDS } from "../../framework/ids";
import { RootState } from "../../../core/store/types";
import { createGenerationButton } from "../generation-button";

export interface InputProps {
  actions: BrainstormActions;
}

const { column, row, button, multilineTextInput } = api.v1.ui.part;

const STYLES = {
  SEND_BTN: { flex: 0.7 },
};

const events = createEvents({
  submit: (props: InputProps) => props.actions.onSubmit(),
  clear: (props: InputProps) => props.actions.onClear(),
  cancel: (props: InputProps) => props.actions.onCancelRequest(),
  continue: (props: InputProps) => props.actions.onContinueRequest(),
});

export const Input: Component<InputProps, RootState> = {
  id: () => `${IDS.BRAINSTORM.INPUT}-area`,

  describe(props) {
    const ids = IDS.BRAINSTORM;

    // Default "Idle" button
    const genButton = createGenerationButton(
      ids.SEND_BTN,
      {
        status: "idle",
        queueLength: 0,
        budgetState: "normal",
      },
      {
        label: "Send",
        onClick: () => events.submit(props),
        onCancel: () => events.cancel(props),
        onContinue: () => events.continue(props),
        style: STYLES.SEND_BTN,
      },
    );

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
          style: { gap: "8px", "margin-top": "8px" },
          content: [
            button({
              id: ids.CLEAR_BTN,
              text: "Clear",
              style: { flex: 0.3 },
              callback: () => events.clear(props),
            }),
            genButton,
          ],
        }),
      ],
    });
  },

  bind({ useSelector, updateParts }, props) {
    const ids = IDS.BRAINSTORM;

    // Watch Generation State
    useSelector(
      (state) => state.runtime.genx,
      (genxState) => {
        const genButton = createGenerationButton(
          ids.SEND_BTN,
          genxState,
          {
            label: "Send",
            onClick: () => events.submit(props),
            onCancel: () => events.cancel(props),
            onContinue: () => events.continue(props),
            style: STYLES.SEND_BTN,
          },
        );

        updateParts([
          {
            id: ids.INPUT,
            disabled: genxState.status === "generating",
          },
          genButton,
        ]);
      },
    );
  },
};
