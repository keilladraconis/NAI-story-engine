export interface FieldSession {
  fieldId: string;
  isRunning: boolean;
  cancellationSignal?: CancellationSignal;
  budgetState?: "normal" | "waiting_for_user" | "waiting_for_timer";
  budgetResolver?: () => void;
  budgetWaitTime?: number;
}

export class AgentCycleManager {
  private sessions: Map<string, FieldSession> = new Map();

  public startSession(fieldId: string): FieldSession {
    const session: FieldSession = {
      fieldId,
      isRunning: false,
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