import { defineComponent, mergeStyles } from "../../../lib/nai-act";
import { NAI_WARNING } from "../colors";

const { row, text, button } = api.v1.ui.part;

export interface ButtonWithConfirmationProps {
  id: string;
  label: string;
  iconId?: IconId;
  confirmLabel?: string;
  style?: any; // Applied to outer container (for layout)
  buttonStyle?: any; // Applied to button element (for appearance)
  onConfirm: () => void;
}

const CONFIRM_ROW_BASE_STYLE = {
  gap: "4px",
  alignItems: "center",
  justifyContent: "center",
  width: "100%",
};

export const ButtonWithConfirmation = defineComponent<ButtonWithConfirmationProps>({
  id: (props) => props.id,

  build(props) {
    const {
      id,
      label,
      iconId,
      confirmLabel = "Confirm?",
      style = {},
      buttonStyle = {},
    } = props;

    const updateVisibility = (isConfirming: boolean) => {
      api.v1.ui.updateParts([
        {
          id: `${id}-btn`,
          style: mergeStyles({ width: "100%" }, buttonStyle, {
            display: isConfirming ? "none" : "flex",
          }),
        },
        {
          id: `${id}-confirm`,
          style: mergeStyles(CONFIRM_ROW_BASE_STYLE, {
            display: isConfirming ? "flex" : "none",
          }),
        },
      ]);
    };

    const showConfirm = () => updateVisibility(true);
    const confirm = () => {
      props.onConfirm();
      updateVisibility(false);
    };
    const cancelConfirm = () => updateVisibility(false);

    const mainButton = button({
      id: `${id}-btn`,
      text: label,
      iconId,
      style: { width: "100%", ...buttonStyle },
      callback: showConfirm,
    });

    const confirmRow = row({
      id: `${id}-confirm`,
      style: mergeStyles(CONFIRM_ROW_BASE_STYLE, { display: "none" }),
      content: [
        text({
          text: confirmLabel,
          style: { color: NAI_WARNING, fontWeight: "bold" },
        }),
        button({
          id: `${id}-yes`,
          text: "Yes",
          style: { color: NAI_WARNING, padding: "2px 8px" },
          callback: confirm,
        }),
        button({
          id: `${id}-no`,
          text: "No",
          style: { padding: "2px 8px" },
          callback: cancelConfirm,
        }),
      ],
    });

    return row({
      id,
      style: { gap: "4px", alignItems: "center", ...style },
      content: [mainButton, confirmRow],
    });
  },
});
