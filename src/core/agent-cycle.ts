interface AgentCycle {
  stage: "generate" | "edit" | "rewrite";
  directive: string;
  input: string;
  output: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

interface FieldSession {
  fieldId: string;
  originalContent: string;
  currentContent: string;
  cycle: AgentCycle[];
  isActive: boolean;
  createdAt: Date;
}

export class AgentCycleManager {
  private sessions: Map<string, FieldSession> = new Map();
}
