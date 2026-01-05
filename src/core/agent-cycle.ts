export interface AgentCycle {
  stage: "generate" | "review" | "refine";
  content: string;
  status: "idle" | "running" | "completed" | "error";
}

export interface FieldSession {
  fieldId: string;
  selectedStage: "generate" | "review" | "refine";
  isAuto: boolean;
  cancellationSignal?: CancellationSignal;
  budgetState?: "normal" | "waiting_for_user" | "waiting_for_timer";
  budgetResolver?: () => void;
  budgetWaitTime?: number;
  cycles: {
    generate: AgentCycle;
    review: AgentCycle;
    refine: AgentCycle;
  };
}

export class AgentCycleManager {
  private sessions: Map<string, FieldSession> = new Map();

  public startSession(fieldId: string): FieldSession {
    const session: FieldSession = {
      fieldId,
      selectedStage: "generate",
      isAuto: false,
      cycles: {
        generate: { stage: "generate", content: "", status: "idle" },
        review: { stage: "review", content: "", status: "idle" },
        refine: { stage: "refine", content: "", status: "idle" },
      },
    };
    this.sessions.set(fieldId, session);
    return session;
  }

  public getSession(fieldId: string): FieldSession | undefined {
    return this.sessions.get(fieldId);
  }

  public updateSession(fieldId: string, updates: Partial<FieldSession>): void {
    const session = this.sessions.get(fieldId);
    if (session) {
      Object.assign(session, updates);
    }
  }

  public endSession(fieldId: string): void {
    this.sessions.delete(fieldId);
  }
}