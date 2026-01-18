import { RootState } from "../../core/store";
import { GenerationState } from "../../../lib/gen-x";
import { Store } from "../../core/store/store";

const { button } = api.v1.ui.part;

export interface GenerationButtonProps {
  label?: string;
  onClick: () => void;
  onCancel: () => void;
  onContinue?: () => void; // For budget warnings
}

export function createGenerationButton(
  id: string,
  genxState: GenerationState,
  props: GenerationButtonProps
): UIPart & { id: string } {
  const { status, budgetState, budgetTimeRemaining } = genxState;
  const label = props.label ?? "Generate";

  // 1. Queued
  if (status === "queued") {
    return button({
      id: `${id}`, // Main ID for the button to ensure replacement
      text: label ? ` ${label} (Queued)` : " Queued",
      iconId: "clock",
      style: {
        "background-color": "#e2e3e5",
        color: "#383d41",
        cursor: "pointer",
        padding: "4px 8px",
      },
      callback: props.onCancel,
    }) as UIPart & { id: string };
  }

  // 2. Waiting for User (Budget)
  if (status === "waiting_for_user" || budgetState === "waiting_for_user") {
    return button({
      id: `${id}`,
      text: label ? ` ${label} (Continue)` : " Continue",
      iconId: "alertTriangle",
      style: {
        "background-color": "#fff3cd",
        color: "#856404",
        "font-weight": "bold",
        padding: "4px 8px",
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
      id: `${id}`,
      text: label ? ` Waiting...${timeText}` : timeText,
      iconId: "clock",
      style: {
        "background-color": "#e2e3e5",
        color: "#383d41",
        padding: "4px 8px",
      },
      callback: props.onCancel, // Allow cancelling the wait
    }) as UIPart & { id: string };
  }

  // 4. Generating / Running
  if (status === "generating") {
    return button({
      id: `${id}`,
      text: label ? ` Cancel` : " Cancel",
      iconId: "x",
      style: {
        "font-weight": "bold",
        "background-color": "#ffcccc",
        color: "red",
        padding: "4px 8px",
      },
      callback: props.onCancel,
    }) as UIPart & { id: string };
  }

  // 5. Idle / Default
  return button({
    id: `${id}`,
    text: ` ${label}`,
    iconId: "zap",
    style: { "font-weight": "bold", padding: "4px 8px" },
    callback: props.onClick,
  }) as UIPart & { id: string };
}

/**
 * Mounts a reactive generation button.
 * Subscribes to the store and updates the UI part when GenX state changes.
 */
export function mountGenerationButton(
  store: Store<RootState>,
  id: string,
  props: GenerationButtonProps
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
    }
  );
}
