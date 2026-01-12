export interface GenerationSession {
  id: string; // Unique ID for this generation task
  fieldId: string; // The target field ID (or "brainstorm")
  type: "field" | "dulfs-item" | "brainstorm";
  
  // State
  isRunning: boolean;
  isQueued?: boolean;
  error?: string;
  
  // Budget / Cancellation
  cancellationSignal?: CancellationSignal;
  budgetState?: "normal" | "waiting_for_user" | "waiting_for_timer";
  budgetResolver?: () => void;
  budgetRejecter?: (reason?: any) => void;
  budgetWaitTime?: number;
  budgetTimeRemaining?: number;
  budgetWaitEndTime?: number;

  // Specific Params
  isInitial?: boolean; // For brainstorm
  dulfsFieldId?: string; // For dulfs-item, the category ID
  outputBuffer?: string; // Accumulate output here
}

// Backward compatibility / convenience aliases if needed
export type FieldSession = GenerationSession;
export type ListSession = GenerationSession;
export type BrainstormSession = GenerationSession;