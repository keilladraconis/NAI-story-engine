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

  // Budget Timer info
  budgetWaitEndTime?: number;
}

// Message factory for JIT (just-in-time) strategy building
export type MessageFactory = () => Promise<{
  messages: Message[];
  params?: Partial<GenerationParams>;
}>;

interface GenerationTask {
  id: string;
  messages: Message[] | null; // null if using factory
  messageFactory?: MessageFactory;
  params: GenerationParams & {
    minTokens?: number;
    maxRetries?: number;
    taskId?: string;
  };
  callback?: (choices: GenerationChoice[], final: boolean) => void;
  behaviour?: "background" | "blocking";
  signal?: CancellationSignal;
  resolve: (value: GenerationResponse) => void;
  reject: (reason: any) => void;
}

export interface GenXHooks {
  /** Fires on every internal state change (replaces subscribe for store use) */
  onStateChange?(state: GenerationState): void;
  /** Fires when a queued task begins execution (picked off queue) */
  onTaskStarted?(taskId: string): void;
  /** Fires just before API call, after factory resolution */
  beforeGenerate?(taskId: string, messages: Message[]): void;
}

export class GenX {
  private queue: GenerationTask[] = [];
  private currentTask: GenerationTask | null = null;

  private _state: GenerationState = {
    status: "idle",
    queueLength: 0,
  };

  private listeners: ((state: GenerationState) => void)[] = [];
  private hooks?: GenXHooks;

  constructor(hooks?: GenXHooks) {
    this.hooks = hooks;
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
   *
   * When `messages` is a MessageFactory function, it will be called at execution
   * time (when the job is picked off the queue), enabling JIT strategy building.
   */
  public generate(
    messages: Message[] | MessageFactory,
    params: GenerationParams & {
      minTokens?: number;
      maxRetries?: number;
      taskId?: string;
    },
    callback?: (choices: GenerationChoice[], final: boolean) => void,
    behaviour?: "background" | "blocking",
    signal?: CancellationSignal,
  ): Promise<GenerationResponse> {
    return new Promise((resolve, reject) => {
      const isFactory = typeof messages === "function";

      const task: GenerationTask = {
        id: params.taskId || api.v1.uuid(),
        messages: isFactory ? null : (messages as Message[]),
        messageFactory: isFactory ? (messages as MessageFactory) : undefined,
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

  public getTaskStatus(taskId: string): "queued" | "processing" | "not_found" {
    if (this.currentTask && this.currentTask.id === taskId) {
      return "processing";
    }
    if (this.queue.some((t) => t.id === taskId)) {
      return "queued";
    }
    return "not_found";
  }

  public cancelQueued(taskId: string): boolean {
    const index = this.queue.findIndex((t) => t.id === taskId);
    if (index === -1) return true;

    const [task] = this.queue.splice(index, 1);
    if (task.signal) {
      task.signal.cancel();
    }
    task.reject("Cancelled");
    this.updateState({
      queueLength: this.queue.length + (this.currentTask ? 1 : 0),
    });
    return true;
  }

  public cancelAll() {
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
    if (this._state.status === "waiting_for_user") {
      this.updateState({ status: "waiting_for_budget" });
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
    this.hooks?.onStateChange?.(snapshot);
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
    this.hooks?.onTaskStarted?.(task.id);

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
    let { messages, params } = task;
    const { callback, behaviour, signal, resolve, reject } = task;

    // JIT: Resolve factory at execution time (when job is picked off queue)
    if (!messages && task.messageFactory) {
      try {
        const resolved = await task.messageFactory();
        messages = resolved.messages;
        if (resolved.params) {
          params = { ...params, ...resolved.params };
        }
      } catch (e: any) {
        this.updateState({ status: "failed", error: e.message || String(e) });
        reject(e);
        return;
      }
    }

    if (!messages) {
      const err = "No messages provided for generation";
      this.updateState({ status: "failed", error: err });
      reject(err);
      return;
    }

    this.hooks?.beforeGenerate?.(task.id, messages);

    const { minTokens, maxRetries, taskId, ...apiParams } = params;
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

  private async ensureBudget(
    requested: number,
    _min: number,
    signal?: CancellationSignal,
  ): Promise<void> {
    let available = api.v1.script.getAllowedOutput();

    if (available < requested) {
      const time = api.v1.script.getTimeUntilAllowedOutput(requested);
      const targetEnd = Date.now() + time;

      api.v1.log(
        `Waiting for budget: Have ${available}, Need ${requested}, Time ${time}ms`,
      );

      this.updateState({
        status: "waiting_for_user",
        budgetWaitEndTime: targetEnd,
      });

      // 3. Final Wait (Platform enforcement)
      await api.v1.script.waitForAllowedOutput(requested);
      if (signal?.cancelled) return;

      this.updateState({
        status: "generating",
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
