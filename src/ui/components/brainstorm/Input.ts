import { defineComponent } from "nai-act";
import { RootState } from "../../../core/store/types";
import { IDS, STORAGE_KEYS } from "../../framework/ids";
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

export const Input = defineComponent<{}, RootState>({
  id: () => `${IDS.BRAINSTORM.INPUT}-area`,

  build(_props, ctx) {
    const { dispatch } = ctx;
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

    return column({
      content: [
        multilineTextInput({
          id: ids.INPUT,
          placeholder: "Type an idea...",
          storageKey: STORAGE_KEYS.brainstormInputUI(ids.INPUT),
          style: { "min-height": "60px", "max-height": "120px" },
          onSubmit: submit,
          // Bind disabled state reactively
          ...ctx.bindPart(
            ids.INPUT,
            (state) => state.runtime.activeRequest?.type === "brainstorm" && state.runtime.genx.status === "generating",
            (isBrainstormGenerating) => ({ disabled: isBrainstormGenerating }),
          ),
        }),
        row({
          id: `${ids.INPUT}-btn-row`,
          style: { gap: "8px", "margin-top": "8px" },
          content: [clearBtn, sendBtn],
        }),
      ],
    });
  },
});
