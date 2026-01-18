import { RootState } from "../../core/store";
import { GenerationState } from "../../../lib/gen-x";
import { Store } from "../../core/store/store";
import { NAI_DARK_BACKGROUND, NAI_HEADER, NAI_WARNING } from "../colors";

const { button } = api.v1.ui.part;

export interface GenerationButtonProps {
  label?: string;
  onClick: () => void;
  onCancel: () => void;
  onContinue?: () => void; // For budget warnings
  style: any;
}

export function createGenerationButton(
  id: string,
  genxState: GenerationState,
  props: GenerationButtonProps,
): UIPart & { id: string } {
  const { status, budgetState, budgetTimeRemaining } = genxState;
  const label = props.label ?? "Generate";

  // 1. Queued
  if (status === "queued") {
    return button({
      id: id, // Main ID for the button to ensure replacement
      text: label ? `Queued` : "",
      iconId: "clock",
      callback: props.onCancel,
      style: props.style,
    }) as UIPart & { id: string };
  }

  // 2. Waiting for User (Budget)
  if (status === "waiting_for_user" || budgetState === "waiting_for_user") {
    return button({
      id: id,
      text: label ? `Continue` : " Continue",
      iconId: "fast-forward",
      style: {
        background: NAI_HEADER,
        ...props.style,
      },
      callback: () => {
        if (props.onContinue) props.onContinue();
      },
    }) as UIPart & { id: string };
  }

  // 3. Waiting for Timer (Budget)
  if (status === "waiting_for_budget" || budgetState === "waiting_for_timer") {
    const remaining = budgetTimeRemaining
      ? Math.ceil(budgetTimeRemaining / 1000)
      : 0;
    const timeText = remaining > 0 ? ` ${remaining}s` : "...";

    return button({
      id: id,
      text: label ? `Waiting...${timeText}` : timeText,
      iconId: "clock",
      callback: props.onCancel, // Allow cancelling the wait
      style: props.style,
    }) as UIPart & { id: string };
  }

  // 4. Generating / Running
  if (status === "generating") {
    return button({
      id: id,
      text: label ? "Cancel" : "",
      iconId: "x",
      style: {
        background: NAI_WARNING,
        color: NAI_DARK_BACKGROUND,
        ...props.style,
      },
      callback: props.onCancel,
    }) as UIPart & { id: string };
  }

  // 5. Idle / Default
  return button({
    id: id,
    text: label,
    iconId: "zap",
    callback: props.onClick,
    style: props.style,
  }) as UIPart & { id: string };
}

/**
 * Mounts a reactive generation button.
 * Subscribes to the store and updates the UI part when GenX state changes.
 */
export function mountGenerationButton(
  store: Store<RootState>,
  id: string,
  props: GenerationButtonProps,
) {
  // Initial Render (Optional, usually handled by parent renderer, but good for mounting)
  // We assume the parent has already rendered the initial button.

  return store.subscribeSelector(
    (state: RootState) => state.runtime.genx,
    (genxState: GenerationState) => {
      // Create the updated part
      const part = createGenerationButton(id, genxState, props);

      // Update via API
      if (part) {
        api.v1.ui.updateParts([part]);
      }
    },
  );
}
