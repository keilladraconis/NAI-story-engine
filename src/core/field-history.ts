export interface FieldHistory {
  id: string;
  timestamp: Date;
  version: number;
  content: string;
  source: "user" | "generate" | "edit" | "rewrite" | "commit" | "auto-save";
  metadata?: {
    agentCycleId?: string; // Reference to the agent cycle that generated this version
    parentVersionId?: string; // Reference to the previous version for diff/undo
    wordCount?: number; // Track content evolution
    revisionNotes?: string; // Optional notes about changes
    linkedEntities?: string[]; // Track which entities were linked at this version
  };
}

export class FieldHistoryManager {}
