import { describe, it, expect } from "vitest";
import {
  deriveSetup,
  foundationOpen,
  selectBootstrapPending,
  setupSignature,
  type SetupInputs,
} from "../../src/ui/panels/setup/setup-model";
import { initialRuntimeState } from "../../src/core/store/slices/runtime";
import { initialUIState } from "../../src/core/store/slices/ui";
import { initialFoundationState } from "../../src/core/store/slices/foundation";
import type { RootState } from "../../src/core/store";
import type { Chat } from "../../src/core/chat-types/types";
import type {
  GenerationRequest,
  RuntimeState,
  UIState,
} from "../../src/core/store/types";
import type { FoundationState } from "../../src/core/store/types";

const INPUTS: SetupInputs = { hasDocumentContent: false };

function req(type: GenerationRequest["type"], id: string): GenerationRequest {
  return { id, type, targetId: "t", status: "queued" };
}

/** A Scenario carrying `n` messages. */
function scenario(n: number): Chat {
  return {
    id: "c1",
    type: "scenario",
    title: "Scenario 1",
    messages: Array.from({ length: n }, (_, i) => ({
      id: String(i),
      role: "user" as const,
      content: "hi",
    })),
    seed: { kind: "blank" },
  };
}

function state(
  runtime: Partial<RuntimeState> = {},
  ui: Partial<UIState> = {},
  foundation: Partial<FoundationState> = {},
  chats: Chat[] = [],
): RootState {
  return {
    runtime: { ...initialRuntimeState, ...runtime },
    ui: { ...initialUIState, ...ui },
    foundation: { ...initialFoundationState, ...foundation },
    chat: { chats, activeChatId: null },
  } as RootState;
}

/** Any Foundation content at all — one filled field is enough. */
const FILLED: Partial<FoundationState> = { situation: "a premise" };

describe("deriveSetup — the Scenario prompt", () => {
  it("shows on a blank tab: nothing written, nothing discussed", () => {
    expect(deriveSetup(state(), INPUTS).showScenarioCta).toBe(true);
  });

  it("steps aside once a Scenario carries a message", () => {
    const m = deriveSetup(state({}, {}, {}, [scenario(1)]), INPUTS);
    expect(m.showScenarioCta).toBe(false);
  });

  it("ignores a Scenario that exists but has never been used", () => {
    const m = deriveSetup(state({}, {}, {}, [scenario(0)]), INPUTS);
    expect(m.showScenarioCta).toBe(true);
  });

  it("steps aside once any Foundation field is filled", () => {
    expect(deriveSetup(state({}, {}, FILLED), INPUTS).showScenarioCta).toBe(
      false,
    );
  });
});

describe("foundationOpen", () => {
  it("starts collapsed while no Scenario has content", () => {
    expect(foundationOpen(null, false)).toBe(false);
  });

  it("opens itself once a Scenario has content", () => {
    expect(foundationOpen(null, true)).toBe(true);
  });

  it("obeys the writer's collapse even after a Scenario starts", () => {
    expect(foundationOpen(false, true)).toBe(false);
  });

  it("obeys the writer's expand before any Scenario exists", () => {
    expect(foundationOpen(true, false)).toBe(true);
  });
});

describe("deriveSetup — foundation section", () => {
  it("follows the flow when untouched", () => {
    expect(deriveSetup(state(), INPUTS).foundationOpen).toBe(false);
    expect(
      deriveSetup(state({}, {}, {}, [scenario(2)]), INPUTS).foundationOpen,
    ).toBe(true);
  });

  it("keeps the writer's choice once made", () => {
    const m = deriveSetup(
      state({}, { foundationExpanded: false }, {}, [scenario(2)]),
      INPUTS,
    );
    expect(m.foundationOpen).toBe(false);
  });
});

describe("deriveSetup — the opening scene card", () => {
  it("hides while the Foundation is still empty", () => {
    expect(deriveSetup(state(), INPUTS).showBootstrap).toBe(false);
  });

  it("appears once the Foundation has content and the story is blank", () => {
    expect(deriveSetup(state({}, {}, FILLED), INPUTS).showBootstrap).toBe(true);
  });

  it("hides again once the story has prose — there is no Continue", () => {
    const m = deriveSetup(state({}, {}, FILLED), {
      hasDocumentContent: true,
    });
    expect(m.showBootstrap).toBe(false);
  });

  it("disables itself while its request is queued", () => {
    const m = deriveSetup(
      state({ queue: [req("bootstrap", "b1")] }, {}, FILLED),
      INPUTS,
    );
    expect(m.bootstrapDisabled).toBe(true);
  });

  it("disables itself while its request is active", () => {
    const m = deriveSetup(
      state(
        {
          activeRequest: { ...req("bootstrap", "b2"), status: "processing" },
        },
        {},
        FILLED,
      ),
      INPUTS,
    );
    expect(m.bootstrapDisabled).toBe(true);
  });

  it("stays enabled for unrelated work", () => {
    const m = deriveSetup(
      state({ queue: [req("foundation", "f1")] }, {}, FILLED),
      INPUTS,
    );
    expect(m.bootstrapDisabled).toBe(false);
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

  it("is true for a queued opening generation", () => {
    expect(
      selectBootstrapPending(state({ queue: [req("bootstrap", "a")] })),
    ).toBe(true);
  });
});

describe("setupSignature", () => {
  it("is stable for an unchanged state", () => {
    expect(setupSignature(state())).toBe(setupSignature(state()));
  });

  it("changes for every field deriveSetup reads", () => {
    const base = setupSignature(state());
    const variants = [
      state({ queue: [req("bootstrap", "1")] }),
      state({ activeRequest: { ...req("chat", "c"), status: "processing" } }),
      state({}, { importWizardOpen: true }),
      state({}, { foundationExpanded: true }),
      state({}, { foundationExpanded: false }),
      state({}, {}, FILLED),
      state({}, {}, {}, [scenario(1)]),
    ];
    for (const v of variants) {
      expect(setupSignature(v)).not.toBe(base);
    }
  });

  it("separates the writer's collapse from the untouched default", () => {
    expect(setupSignature(state({}, { foundationExpanded: false }))).not.toBe(
      setupSignature(state()),
    );
  });

  it("changes when a same-length queue swaps contents", () => {
    const a = setupSignature(state({ queue: [req("bootstrap", "1")] }));
    const b = setupSignature(state({ queue: [req("foundation", "2")] }));
    expect(a).not.toBe(b);
  });
});
