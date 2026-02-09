import { Component, createEvents, mergeStyles } from "../../../lib/nai-act";
import { RootState } from "../../core/store/types";
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

const events = createEvents<
  ButtonWithConfirmationProps,
  {
    showConfirm(): void;
    confirm(): void;
    cancel(): void;
  }
>();

// Store registered props per button id (includes styles)
const buttonRegistry: Record<string, ButtonWithConfirmationProps> = {};

const CONFIRM_ROW_BASE_STYLE = {
  gap: "4px",
  alignItems: "center",
  justifyContent: "center",
  width: "100%",
};

const updateVisibility = (id: string, isConfirming: boolean) => {
  const props = buttonRegistry[id];
  const buttonStyle = props?.buttonStyle ?? {};

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

// Attach handlers once at module level
events.attach({
  showConfirm(p) {
    updateVisibility(p.id, true);
  },
  confirm(p) {
    // Use registered props (from build) to get the real onConfirm callback
    const registeredProps = buttonRegistry[p.id];
    registeredProps?.onConfirm();
    updateVisibility(p.id, false);
  },
  cancel(p) {
    updateVisibility(p.id, false);
  },
});

export const ButtonWithConfirmation: Component<
  ButtonWithConfirmationProps,
  RootState
> = {
  id: (props) => props.id,
  events,

  build(props) {
    const {
      id,
      label,
      iconId,
      confirmLabel = "Confirm?",
      style = {},
      buttonStyle = {},
    } = props;

    // Register props so updateVisibility can access buttonStyle
    buttonRegistry[id] = props;

    const mainButton = button({
      id: `${id}-btn`,
      text: label,
      iconId,
      style: { width: "100%", ...buttonStyle },
      callback: () => events.showConfirm(props),
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
          callback: () => events.confirm(props),
        }),
        button({
          id: `${id}-no`,
          text: "No",
          style: { padding: "2px 8px" },
          callback: () => events.cancel(props),
        }),
      ],
    });

    return row({
      id,
      style: { gap: "4px", alignItems: "center", ...style },
      content: [mainButton, confirmRow],
    });
  },
};
