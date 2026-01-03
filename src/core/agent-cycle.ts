export interface AgentCycle {
  stage: "generate" | "review" | "refine";
  content: string;
  status: "idle" | "running" | "completed" | "error";
}

export interface FieldSession {
  fieldId: string;
  originalContent: string;
  currentContent: string; // The final result or currently previewed content
  selectedStage: "generate" | "review" | "refine";
  isAuto: boolean;
  cycles: {
    generate: AgentCycle;
    review: AgentCycle;
    refine: AgentCycle;
  };
  isActive: boolean;
  progress: string; // Keep for backward compat or logging
}

export class AgentCycleManager {
  private sessions: Map<string, FieldSession> = new Map();

  public startSession(fieldId: string, originalContent: string): FieldSession {
    const session: FieldSession = {
      fieldId,
      originalContent,
      currentContent: originalContent,
      selectedStage: "generate",
      isAuto: false,
      cycles: {
        generate: { stage: "generate", content: "", status: "idle" },
        review: { stage: "review", content: "", status: "idle" },
        refine: { stage: "refine", content: "", status: "idle" },
      },
      isActive: true,
      progress: "Session started.",
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