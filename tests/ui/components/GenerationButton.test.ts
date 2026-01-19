import { describe, it, expect, vi } from "vitest";
import { GenerationButton, GenerationButtonProps } from "../../../src/ui/components/GenerationButton";
import { RootState } from "../../../src/core/store/types";

describe("GenerationButton Component", () => {
  const buttonId = "gen-btn-1";
  const props: GenerationButtonProps = {
    id: buttonId,
    label: "Send",
    onClick: vi.fn(),
    onCancel: vi.fn(),
    onContinue: vi.fn(),
    style: {},
  };

  const createSlice = (genxState: any, activeReqId?: string, queue: any[] = []): RootState => ({
    runtime: {
        genx: {
            status: genxState.status || "idle",
            budgetState: genxState.budgetState,
            budgetTimeRemaining: genxState.budgetTimeRemaining || 0,
            // Mock other genx props if needed
        } as any,
        queue: queue,
        activeRequest: activeReqId ? { id: activeReqId } as any : null,
        segaRunning: false,
        status: "idle",
        budgetTimeRemaining: 0
    },
    story: {} as any,
    ui: {} as any
  });

  it("should render 'Send' (Idle) state", () => {
    const state = createSlice({ status: "idle" });
    const part: any = GenerationButton.describe(props, state);

    // Find visible button
    const visibleBtn = part.content.find((c: any) => c.style.display === "block");
    expect(visibleBtn).toBeDefined();
    expect(visibleBtn.text).toBe("⚡ Send");
  });

  it("should render 'Queued' state", () => {
    const state = createSlice({ status: "queued" });
    const part: any = GenerationButton.describe(props, state);

    const visibleBtn = part.content.find((c: any) => c.style.display === "block");
    expect(visibleBtn).toBeDefined();
    expect(visibleBtn.text).toBe("⏳ Send (Queued)");
  });

  it("should render 'Cancel' (Generating) state", () => {
    const state = createSlice({ status: "generating" });
    const part: any = GenerationButton.describe(props, state);

    const visibleBtn = part.content.find((c: any) => c.style.display === "block");
    expect(visibleBtn).toBeDefined();
    expect(visibleBtn.text).toBe("🚫 Cancel");
  });

  it("should render 'Continue' (Waiting for User) state", () => {
    const state = createSlice({ status: "waiting_for_user", budgetState: "waiting_for_user" });
    const part: any = GenerationButton.describe(props, state);

    const visibleBtn = part.content.find((c: any) => c.style.display === "block");
    expect(visibleBtn).toBeDefined();
    expect(visibleBtn.text).toBe("⚠️ Continue");
  });

  it("should render Timer (Waiting for Budget) state", () => {
    const state = createSlice({ 
        status: "waiting_for_budget", 
        budgetState: "waiting_for_timer",
        budgetTimeRemaining: 5000 
    });
    const part: any = GenerationButton.describe(props, state);

    const visibleBtn = part.content.find((c: any) => c.style.display === "block");
    expect(visibleBtn).toBeDefined();
    expect(visibleBtn.text).toContain("5s");
  });
});
