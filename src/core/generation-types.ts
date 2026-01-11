export interface GenerationSession {
  fieldId: string;
  isRunning: boolean;
  isQueued?: boolean;
  cancellationSignal?: CancellationSignal;
  budgetState?: "normal" | "waiting_for_user" | "waiting_for_timer";
  budgetResolver?: () => void;
  budgetWaitTime?: number;
  budgetTimeRemaining?: number;
  budgetWaitEndTime?: number;
  error?: string;
}

export interface FieldSession extends GenerationSession {
  // Specific to field generation if any
}

export interface ListSession extends GenerationSession {
  // Specific to list generation if any
}
