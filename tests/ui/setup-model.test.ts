import { describe, it, expect } from "vitest";
import {
  deriveSetup,
  selectBootstrapPending,
  setupSignature,
  type SetupInputs,
} from "../../src/ui/panels/setup/setup-model";
import { initialRuntimeState } from "../../src/core/store/slices/runtime";
import { initialUIState } from "../../src/core/store/slices/ui";
import type { RootState } from "../../src/core/store";
import type {
  GenerationRequest,
  RuntimeState,
  UIState,
} from "../../src/core/store/types";

const INPUTS: SetupInputs = { hasDocumentContent: false };

function req(type: GenerationRequest["type"], id: string): GenerationRequest {
  return { id, type, targetId: "t", status: "queued" };
}

function state(
  runtime: Partial<RuntimeState> = {},
  ui: Partial<UIState> = {},
): RootState {
  return {
    runtime: { ...initialRuntimeState, ...runtime },
    ui: { ...initialUIState, ...ui },
  } as RootState;
}

describe("deriveSetup — bootstrap", () => {
  it("labels bootstrap from document content", () => {
    expect(deriveSetup(state(), INPUTS).bootstrap.text).toBe("Opening Scene");
    expect(
      deriveSetup(state(), { hasDocumentContent: true }).bootstrap.text,
    ).toBe("Continue Scene");
  });

  it("disables bootstrap while its request is queued", () => {
    const m = deriveSetup(state({ queue: [req("bootstrap", "b1")] }), INPUTS);
    expect(m.bootstrap.disabled).toBe(true);
  });

  it("disables bootstrap while its request is active", () => {
    const m = deriveSetup(
      state({
        activeRequest: {
          ...req("bootstrapContinue", "b2"),
          status: "processing",
        },
      }),
      INPUTS,
    );
    expect(m.bootstrap.disabled).toBe(true);
  });

  it("leaves bootstrap enabled for unrelated work", () => {
    const m = deriveSetup(state({ queue: [req("foundation", "f1")] }), INPUTS);
    expect(m.bootstrap.disabled).toBe(false);
  });
});

describe("deriveSetup — import", () => {
  it("disables import only while the wizard is open", () => {
    expect(deriveSetup(state(), INPUTS).importDisabled).toBe(false);
    expect(
      deriveSetup(state({}, { importWizardOpen: true }), INPUTS).importDisabled,
    ).toBe(true);
  });
});

describe("selectBootstrapPending", () => {
  it("is false with an empty queue and no active request", () => {
    expect(selectBootstrapPending(state())).toBe(false);
  });

  it("is true for both bootstrap request types", () => {
    expect(
      selectBootstrapPending(state({ queue: [req("bootstrap", "a")] })),
    ).toBe(true);
    expect(
      selectBootstrapPending(state({ queue: [req("bootstrapContinue", "b")] })),
    ).toBe(true);
  });
});

describe("setupSignature", () => {
  it("is stable for an unchanged state", () => {
    expect(setupSignature(state())).toBe(setupSignature(state()));
  });

  it("changes when a same-length queue swaps contents", () => {
    const a = setupSignature(state({ queue: [req("bootstrap", "1")] }));
    const b = setupSignature(state({ queue: [req("foundation", "2")] }));
    expect(a).not.toBe(b);
  });

  it("changes when the import wizard opens", () => {
    expect(setupSignature(state())).not.toBe(
      setupSignature(state({}, { importWizardOpen: true })),
    );
  });

  it("changes when history moves", () => {
    expect(setupSignature(state())).not.toBe(
      setupSignature(state({ historyEpoch: 7 })),
    );
  });
});
