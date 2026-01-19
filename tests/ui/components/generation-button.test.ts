import { describe, it, expect, vi, beforeEach } from "vitest";
import { createStore } from "../../../src/core/store/store";
import {
  rootReducer,
  initialRootState,
} from "../../../src/core/store/reducers/rootReducer";
import { mountGenerationButton } from "../../../src/ui/components/generation-button";
import { runtimeStateUpdated } from "../../../src/core/store/actions";
import { GenerationState } from "../../../lib/gen-x";

describe("GenerationButton Component", () => {
  let store: any;
  const buttonId = "gen-btn-1";
  const props = {
    label: "Send",
    onClick: vi.fn(),
    onCancel: vi.fn(),
    onContinue: vi.fn(),
    style: {},
  };

  beforeEach(() => {
    store = createStore(rootReducer, initialRootState);
    vi.clearAllMocks();
  });

  const updateGenXState = (partial: Partial<GenerationState>) => {
    store.dispatch(
      runtimeStateUpdated({
        genxState: {
          status: "idle",
          queueLength: 0,
          budgetState: "normal",
          ...partial,
        },
      }),
    );
  };

  it("should render 'Send' (Idle) state", () => {
    mountGenerationButton(store, buttonId, props);

    // Trigger update to queued then back to idle to verify idle rendering
    updateGenXState({ status: "queued", queueLength: 1 });
    updateGenXState({ status: "idle", queueLength: 0 });

    const callArgs = (api.v1.ui.updateParts as any).mock.lastCall[0];
    const buttonPart = callArgs[0];

    expect(buttonPart.text).toBe("Send");
    expect(buttonPart.iconId).toBe("zap");
  });

  it("should render 'Queued' state and wire Cancel action", () => {
    mountGenerationButton(store, buttonId, props);

    updateGenXState({ status: "queued", queueLength: 1 });

    const callArgs = (api.v1.ui.updateParts as any).mock.lastCall[0];
    const buttonPart = callArgs[0];

    expect(buttonPart.text).toBe("Queued");
    expect(buttonPart.iconId).toBe("clock");

    // Simulate click
    buttonPart.callback();

    // Check if onCancel prop was called (and implicitly the action would be dispatched if we were checking store.dispatch,
    // but here we check if the wrapped callback calls our spy)
    expect(props.onCancel).toHaveBeenCalled();
    // We can also spy on store.dispatch if we wanted to verify the action type
  });

  it("should render 'Cancel' (Generating) state", () => {
    mountGenerationButton(store, buttonId, props);

    updateGenXState({ status: "generating" });

    const callArgs = (api.v1.ui.updateParts as any).mock.lastCall[0];
    const buttonPart = callArgs[0];

    expect(buttonPart.text).toBe("Cancel");
    expect(buttonPart.iconId).toBe("x");
    expect(buttonPart.style.background).toBeDefined(); // Warning color

    buttonPart.callback();
    expect(props.onCancel).toHaveBeenCalled();
  });

  it("should render 'Continue' (Waiting for User) state", () => {
    mountGenerationButton(store, buttonId, props);

    updateGenXState({
      status: "waiting_for_user",
      budgetState: "waiting_for_user",
    });

    const callArgs = (api.v1.ui.updateParts as any).mock.lastCall[0];
    const buttonPart = callArgs[0];

    expect(buttonPart.text).toBe("Continue");
    expect(buttonPart.iconId).toBe("fast-forward");

    buttonPart.callback();
    expect(props.onContinue).toHaveBeenCalled();
  });

  it("should render Timer (Waiting for Budget) state", () => {
    mountGenerationButton(store, buttonId, props);

    updateGenXState({
      status: "waiting_for_budget",
      budgetState: "waiting_for_timer",
      budgetTimeRemaining: 5000,
    });

    const callArgs = (api.v1.ui.updateParts as any).mock.lastCall[0];
    const buttonPart = callArgs[0];

    expect(buttonPart.text).toContain("5s");
    expect(buttonPart.iconId).toBe("clock");
  });
});
