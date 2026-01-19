/**
 * gen-x.ts
 * v1.0.0
 *
 * The Generation eXchange.
 * A single-threaded, queued generation engine with built-in budget management,
 * transient error handling, and reactive state.
 */

export interface GenerationState {
  status:
    | "idle"
    | "queued"
    | "generating"
    | "waiting_for_budget"
    | "waiting_for_user"
    | "completed"
    | "failed";
  error?: string;
  queueLength: number;

  // Budget/Timer info
  budgetState?: "normal" | "waiting_for_user" | "waiting_for_timer";
  budgetTimeRemaining?: number;
  budgetWaitEndTime?: number;
  budgetWaitTime?: number;
  budgetResolver?: () => void;
  budgetRejecter?: (reason?: any) => void;
}

interface GenerationTask {
  id: string;
  messages: Message[];
  params: GenerationParams & { minTokens?: number; maxRetries?: number };
  callback?: (choices: GenerationChoice[], final: boolean) => void;
  behaviour?: "background" | "blocking";
  signal?: CancellationSignal;
  resolve: (value: GenerationResponse) => void;
  reject: (reason: any) => void;
}

export class GenX {
  private queue: GenerationTask[] = [];
  private currentTask: GenerationTask | null = null;

  private _state: GenerationState = {
    status: "idle",
    queueLength: 0,
    budgetState: "normal",
  };

  private listeners: ((state: GenerationState) => void)[] = [];

  constructor() {
    this.initBudgetListener();
  }

  // --- Public API ---

  public get state(): GenerationState {
    return { ...this._state };
  }

  public subscribe(listener: (state: GenerationState) => void): () => void {
    this.listeners.push(listener);
    listener(this.state); // Immediate update
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  /**
   * Queue a generation request.
   * Mirrors api.v1.generate parameters.
   */
  public generate(
    messages: Message[],
    params: GenerationParams & { minTokens?: number; maxRetries?: number },
    callback?: (choices: GenerationChoice[], final: boolean) => void,
    behaviour?: "background" | "blocking",
    signal?: CancellationSignal,
  ): Promise<GenerationResponse> {
    return new Promise((resolve, reject) => {
      const task: GenerationTask = {
        id: api.v1.uuid(),
        messages,
        params,
        callback,
        behaviour,
        signal,
        resolve,
        reject,
      };

      this.queue.push(task);
      this.updateState({
        status: this._state.status === "idle" ? "queued" : this._state.status,
        queueLength: this.queue.length + (this.currentTask ? 1 : 0),
      });

      this.processQueue();
    });
  }

  public cancelCurrent() {
    // 1. Clear queue
    this.queue = [];

    // 2. Cancel current task if running
    if (this.currentTask && this.currentTask.signal) {
      this.currentTask.signal.cancel();
    }

    // 3. Update state immediately (reactive UI will update)
    // Note: If a task was running, it will reject with "Cancelled" and set status to failed/idle in processQueue loop.
    // But if we just cleared queue and no task was running (e.g. queued state but not picked up?),
    // we should ensure status reflects it.

    // If we are just queued (idle/queued status), we force idle.
    if (!this.currentTask) {
      this.updateState({ status: "idle", queueLength: 0 });
    } else {
      // If task is running, the signal cancellation will trigger the rejection flow which updates state.
      // But we update queue length now.
      this.updateState({ queueLength: 0 }); // Current + 0
    }
  }

  public userInteraction() {
    if (this._state.budgetState === "waiting_for_user") {
      this.updateState({ budgetState: "waiting_for_timer" });

      // If timer has already expired, resolve immediately
      if (
        this._state.budgetWaitEndTime &&
        Date.now() >= this._state.budgetWaitEndTime
      ) {
        this.resolveBudgetWait();
      }
    }
  }

  // --- Internal Logic ---

  private updateState(partial: Partial<GenerationState>) {
    Object.assign(this._state, partial);
    const snapshot = { ...this._state };
    this.listeners.forEach((l) => {
      try {
        l(snapshot);
      } catch (e) {
        api.v1.log("GenX Listener Error:", e);
      }
    });
  }

  private async processQueue() {
    if (this.currentTask) return; // Already processing
    if (this.queue.length === 0) {
      this.updateState({ status: "idle", queueLength: 0 });
      return;
    }

    const task = this.queue.shift();
    if (!task) return;

    this.currentTask = task;
    this.updateState({
      status: "generating",
      queueLength: this.queue.length + 1,
      error: undefined,
    });

    try {
      await this.executeTask(task);
    } catch (e: any) {
      // Task failed (and retries exhausted or fatal)
      // The task.reject() has already been called in executeTask if needed,
      // or we do it here if it wasn't caught.
    } finally {
      this.currentTask = null;
      // Process next
      this.processQueue();
    }
  }

  private async executeTask(task: GenerationTask): Promise<void> {
    const { messages, params, callback, behaviour, signal, resolve, reject } =
      task;
    const { minTokens, maxRetries, ...apiParams } = params;
    const retryLimit = maxRetries ?? 5;
    let attempts = 0;

    while (true) {
      if (signal?.cancelled) {
        reject("Cancelled");
        return;
      }

      try {
        const requestedTokens = apiParams.max_tokens || 1024;
        const minimumTokens = minTokens || 1;

        // Budget Check
        await this.ensureBudget(requestedTokens, minimumTokens, signal);

        if (signal?.cancelled) {
          reject("Cancelled");
          return;
        }

        this.updateState({ status: "generating" });

        const result = await api.v1.generate(
          messages,
          apiParams,
          callback,
          behaviour,
          signal,
        );

        resolve(result);
        this.updateState({ status: "completed" });
        return;
      } catch (e: any) {
        if (signal?.cancelled) {
          reject("Cancelled");
          return;
        }

        if (this.isTransientError(e)) {
          attempts++;
          if (attempts > retryLimit) {
            const err = `Transient error retries exhausted: ${e.message}`;
            this.updateState({ status: "failed", error: err });
            reject(err);
            return;
          }

          const delay = Math.pow(2, attempts) * 1000;
          api.v1.log(
            `Transient error: ${e.message}. Retrying in ${delay}ms...`,
          );
          await api.v1.timers.sleep(delay);
        } else {
          this.updateState({ status: "failed", error: e.message || String(e) });
          reject(e);
          return;
        }
      }
    }
  }

  // --- Budget Management ---

  private initBudgetListener() {
    // Listen for manual "Generate" clicks from user to unblock waiting
    api.v1.hooks.register("onGenerationRequested", (params) => {
      if (!params.scriptInitiated) {
        this.userInteraction();
      }
    });
  }

  private resolveBudgetWait() {
    if (this._state.budgetResolver) {
      this._state.budgetResolver();
      this.updateState({
        budgetState: "normal",
        budgetResolver: undefined,
        budgetRejecter: undefined,
      });
    }
  }

  private async ensureBudget(
    requested: number,
    _min: number,
    signal?: CancellationSignal,
  ): Promise<void> {
    let available = api.v1.script.getAllowedOutput();

    if (available < requested) {
      const time = api.v1.script.getTimeUntilAllowedOutput(requested);
      api.v1.log(
        `Waiting for budget: Have ${available}, Need ${requested}, Time ${time}ms`,
      );

      await new Promise<void>((resolve, reject) => {
        const targetEnd = Date.now() + time;

        const resolver = () => {
          resolve();
        };
        const rejecter = (reason?: any) => {
          reject(reason || "Cancelled");
        };

        this.updateState({
          status: "waiting_for_user",
          budgetState: "waiting_for_user",
          budgetWaitTime: time,
          budgetWaitEndTime: targetEnd,
          budgetTimeRemaining: time,
          budgetResolver: resolver,
          budgetRejecter: rejecter,
        });

        // Ticker for budget timer
        const tick = () => {
          // Check cancellation
          if (signal?.cancelled) {
            rejecter("Cancelled");
            return;
          }

          // Check explicit resolver call (manual resolveBudgetWait)
          if (!this._state.budgetResolver) {
            // Already resolved externally
            return;
          }

          const now = Date.now();
          const remaining = Math.max(0, targetEnd - now);

          this.updateState({ budgetTimeRemaining: remaining });

          // Only resolve if in timer state AND time is up
          if (this._state.budgetState === "waiting_for_timer" && remaining === 0) {
            this.resolveBudgetWait();
            return;
          }

          api.v1.timers.setTimeout(tick, 1000);
        };

        tick();
      });

      // 3. Final Wait (Platform enforcement)
      await api.v1.script.waitForAllowedOutput(requested);

      this.updateState({
        status: "generating",
        budgetState: "normal",
        budgetTimeRemaining: undefined,
      });
    }
  }

  private isTransientError(e: any): boolean {
    const msg = (e?.message || String(e)).toLowerCase();
    return (
      msg.includes("aborted") ||
      msg.includes("fetch") ||
      msg.includes("network") ||
      msg.includes("timeout") ||
      msg.includes("in progress")
    );
  }
}
