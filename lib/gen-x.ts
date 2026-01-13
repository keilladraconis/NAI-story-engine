/**
 * gen-x.ts
 * v0.1.0
 * 
 * A reusable library for managing generation queues, status notifications,
 * and timing logic for budget countdowns.
 * 
 * Dependencies:
 * - Requires 'api' global object for timers (setTimeout).
 * 
 * Design Goals?
 * - Maybe this can replace hyperGenerator. Be a clean wrapper around generate API, but handle transient errors.
 */

// --- Budget / Timer Logic ---

/**
 * Interface for objects that track budget/timer state.
 * Compatible with Story Engine's GenerationSession.
 */
export interface BudgetTracked {
  budgetState?: "normal" | "waiting_for_user" | "waiting_for_timer";
  budgetTimeRemaining?: number;
  budgetWaitEndTime?: number;
  budgetWaitTime?: number;
  budgetResolver?: () => void;
  budgetRejecter?: (reason?: any) => void;
  isRunning?: boolean; // Used to stop timer if task stops
}

export class BudgetTimer {
  private static activeWait: { resolve: () => void; state: BudgetTracked } | null = null;
  private static initialized = false;

  private static init() {
    if (this.initialized) return;
    this.initialized = true;
    
    const listener = (data: any) => {
       if (BudgetTimer.activeWait && data && data.scriptInitiated === false) {
          // User manually triggered generation. Unblock the wait.
          BudgetTimer.activeWait.resolve();
          BudgetTimer.activeWait = null;
       }
    };

    if ((api as any).v1?.events?.on) {
      (api as any).v1.events.on("generationRequested", listener);
    }
  }

  /**
   * Manages the "Waiting for User" phase of a budget wait.
   * Sets state to "waiting_for_user" and waits for either:
   * 1. Manual resolution via state.budgetResolver() (e.g. user clicked "Continue")
   * 2. "generationRequested" event with scriptInitiated=false (user clicked Generate or triggered via keybind)
   * 
   * Once triggered, it automatically calls BudgetTimer.start() to begin the countdown.
   * 
   * @param state The state object to track
   * @param durationMs The duration of the budget wait
   * @param updateFn Callback to notify UI
   */
  static waitForBudget(
    state: BudgetTracked,
    durationMs: number,
    updateFn: () => void
  ): Promise<void> {
    BudgetTimer.init();

    return new Promise((resolve, reject) => {
      
      const proceed = () => {
        if (BudgetTimer.activeWait?.state === state) {
            BudgetTimer.activeWait = null;
        }
        
        BudgetTimer.start(state, durationMs, updateFn)
          .then(resolve)
          .catch(reject);
      };

      // Register this session as the active waiter
      BudgetTimer.activeWait = { resolve: proceed, state };

      state.budgetResolver = () => proceed();
      state.budgetRejecter = (reason) => {
        if (BudgetTimer.activeWait?.state === state) {
            BudgetTimer.activeWait = null;
        }
        reject(reason || "Cancelled");
      };
      
      state.budgetState = "waiting_for_user";
      state.budgetWaitTime = durationMs;
      state.budgetWaitEndTime = Date.now() + durationMs;
      updateFn();
    });
  }

  /**
   * Starts a countdown timer for a budget wait.
   * Updates the state object and calls updateFn on each tick.
   * 
   * @param state The state object to track (must be mutable)
   * @param durationMs Duration to wait in milliseconds
   * @param updateFn Callback to notify UI/listeners of changes
   */
  static start(
    state: BudgetTracked,
    durationMs: number,
    updateFn: () => void
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      state.budgetState = "waiting_for_timer";
      const targetEnd = Date.now() + durationMs;
      state.budgetWaitEndTime = targetEnd;
      state.budgetTimeRemaining = durationMs;

      // Store resolvers so they can be triggered externally
      state.budgetResolver = () => {
         resolve(); 
      };
      
      state.budgetRejecter = (reason) => {
          reject(reason || "Cancelled");
      };

      const tick = () => {
        // Stop if no longer running (cancelled/finished externally)
        if (state.isRunning === false) return; 
        
        // Stop if state changed externally (e.g. user clicked "Continue Now")
        if (state.budgetState !== "waiting_for_timer") return;

        const now = Date.now();
        if (now >= targetEnd) {
          resolve();
          return;
        }
        
        state.budgetTimeRemaining = Math.max(0, targetEnd - now);
        updateFn();
        
        // Recursively schedule next tick
        api.v1.timers.setTimeout(tick, 1000);
      };

      // Start loop
      tick();
      updateFn();
    });
  }
}

// --- Queue Management ---

/**
 * Interface for an item in the queue.
 * @template TPayload The data payload needed to execute the task.
 */
export interface QueueItem<TPayload> {
  id: string; // Unique ID for identification
  data: TPayload;
}

/**
 * Generic class to manage a serial queue of tasks.
 * "GenX" stands for Generation eXchange.
 */
export class GenX<TPayload> {
  private queue: QueueItem<TPayload>[] = [];
  private currentItem: QueueItem<TPayload> | null = null;
  private isProcessing: boolean = false;
  
  // Listeners for queue events
  private listeners: Array<(itemId: string, item?: QueueItem<TPayload>) => void> = [];

  /**
   * @param executor Function that executes a task. Should return a Promise that resolves when task is done.
   */
  constructor(
    private executor: (item: QueueItem<TPayload>) => Promise<void>
  ) {}

  /**
   * Subscribe to queue events (enqueue, start, complete, cancel).
   */
  public subscribe(listener: (itemId: string, item?: QueueItem<TPayload>) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notify(itemId: string, item?: QueueItem<TPayload>) {
    for (const listener of this.listeners) {
      try {
        listener(itemId, item);
      } catch (e) {
        // Ignore listener errors
        api.v1.log(`Queue listener error: ${e}`);
      }
    }
  }

  /**
   * Check if a task with the given ID is currently running.
   */
  public isRunning(itemId: string): boolean {
    return this.currentItem?.id === itemId;
  }

  /**
   * Check if the queue is currently processing tasks.
   */
  public get isActive(): boolean {
    return this.isProcessing;
  }

  /**
   * Add an item to the queue.
   * Triggers processing if idle.
   */
  public enqueue(item: QueueItem<TPayload>) {
    this.queue.push(item);
    this.notify(item.id, item);

    if (!this.isProcessing) {
      this.processQueue();
    }
  }

  /**
   * Get a snapshot of the current queue.
   */
  public getQueue(): QueueItem<TPayload>[] {
    return [...this.queue];
  }

  /**
   * Cancel items matching a predicate.
   * Removes from queue.
   * Returns the list of cancelled items (including the running one if matched).
   * Note: This does NOT stop the running task's promise; the caller must handle 
   * signalling the running task (e.g. via AbortController in TPayload).
   */
  public cancel(matcher: (item: QueueItem<TPayload>) => boolean): QueueItem<TPayload>[] {
    const cancelledItems: QueueItem<TPayload>[] = [];

    // 1. Remove from queue
    const originalQueue = [...this.queue];
    this.queue = [];
    for (const item of originalQueue) {
      if (matcher(item)) {
        cancelledItems.push(item);
      } else {
        this.queue.push(item);
      }
    }

    // 2. Check running item
    if (this.currentItem && matcher(this.currentItem)) {
      cancelledItems.push(this.currentItem);
    }
    
    // Notify about cancellations
    for (const item of cancelledItems) {
      this.notify(item.id, item);
    }

    return cancelledItems;
  }

  private async processQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.queue.length > 0) {
      const item = this.queue.shift();
      if (!item) break;

      this.currentItem = item;
      
      // Notify start
      this.notify(item.id, item);

      try {
        await this.executor(item);
      } catch (e) {
        api.v1.log(`Task execution failed for ${item.id}: ${e}`);
      } finally {
        this.currentItem = null;
        // Notify end
        this.notify(item.id, item);
      }
    }

    this.isProcessing = false;
  }
}
