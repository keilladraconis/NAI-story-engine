export interface AgentCycle {
  stage: "generate" | "review" | "refine";
  content: string;
  status: "idle" | "running" | "completed" | "error";
}

export interface FieldSession {
  fieldId: string;
  originalContent: string;
  currentContent: string;
  cycles: AgentCycle[];
  isActive: boolean;
  progress: string;
}

export class AgentCycleManager {
  private sessions: Map<string, FieldSession> = new Map();

  public startSession(fieldId: string, originalContent: string): FieldSession {
    const session: FieldSession = {
      fieldId,
      originalContent,
      currentContent: originalContent,
      cycles: [
        { stage: "generate", content: "", status: "idle" },
        { stage: "review", content: "", status: "idle" },
        { stage: "refine", content: "", status: "idle" },
      ],
      isActive: true,
      progress: "Session started. Ready to generate.",
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