import { Component, createEvents } from "../../../../lib/nai-act";
import { BrainstormActions } from "./types";
import { IDS } from "../../framework/ids";
import { RootState } from "../../../core/store/types";
import { GenerationButton } from "../GenerationButton";

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

  describe(props, state) {
    const ids = IDS.BRAINSTORM;

    // Default "Idle" button via component
    const genButton = GenerationButton.describe({
      id: ids.SEND_BTN,
      label: "Send",
      style: STYLES.SEND_BTN,
      onClick: () => events.submit(props),
      onCancel: () => events.cancel(props),
      onContinue: () => events.continue(props),
    }, state) as UIPart;

    return column({
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

  bind(ctx, props) {
    const ids = IDS.BRAINSTORM;
    const { useSelector, updateParts } = ctx;

    // Delegate Binding to GenerationButton
    GenerationButton.bind(ctx, {
      id: ids.SEND_BTN,
      label: "Send",
      style: STYLES.SEND_BTN,
      onClick: () => events.submit(props),
      onCancel: () => events.cancel(props),
      onContinue: () => events.continue(props),
    });

    // Watch Generation State for Input Disabling
    useSelector(
      (state) => state.runtime.genx.status,
      (status) => {
        updateParts([
          {
            id: ids.INPUT,
            disabled: status === "generating",
          }
        ]);
      },
    );
  },
};
