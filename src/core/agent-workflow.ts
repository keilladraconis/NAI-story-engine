import { StoryManager } from "./story-manager";
import { ContextStrategyFactory } from "./context-strategies";
import { ContentParsingService } from "./content-parsing-service";
import { FieldSession, ListSession, BrainstormSession } from "./generation-types";
import { FieldGenerationService } from "./field-generation-service";
import { ListGenerationService } from "./list-generation-service";
import { BrainstormService } from "./brainstorm-service";

export { FieldSession, ListSession, BrainstormSession } from "./generation-types";

export class AgentWorkflowService {
  private sessions: Map<string, FieldSession> = new Map();
  private listGenerationState: Map<string, ListSession> = new Map();
  private brainstormSession: BrainstormSession = {
    fieldId: "brainstorm",
    isRunning: false,
  };
  private listeners: Array<(fieldId: string) => void> = [];

  private taskQueue: Array<
    | { type: "field"; fieldId: string; updateFn: () => void }
    | { type: "list"; fieldId: string; updateFn: () => void }
    | {
        type: "brainstorm";
        updateFn: () => void;
        isInitial: boolean;
        onDelta: (t: string) => void;
      }
  > = [];
  private isGlobalGenerating: boolean = false;

  private fieldService: FieldGenerationService;
  private listService: ListGenerationService;
  public brainstormService: BrainstormService;

  constructor(storyManager: StoryManager) {
    const contextFactory = new ContextStrategyFactory(storyManager);
    const parsingService = new ContentParsingService();

    this.fieldService = new FieldGenerationService(
      storyManager,
      contextFactory
    );
    this.listService = new ListGenerationService(
      storyManager,
      contextFactory,
      parsingService
    );
    this.brainstormService = new BrainstormService(storyManager);
  }

  public subscribe(listener: (fieldId: string) => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify(fieldId: string) {
    for (const listener of this.listeners) {
      try {
        listener(fieldId);
      } catch (e) {
        api.v1.log(`Workflow listener error: ${e}`);
      }
    }
  }

  public getSession(fieldId: string): FieldSession | undefined {
    return this.sessions.get(fieldId);
  }

  public startSession(fieldId: string): FieldSession {
    const session: FieldSession = {
      fieldId,
      isRunning: false,
    };
    this.sessions.set(fieldId, session);
    return session;
  }

  public getListGenerationState(fieldId: string): ListSession {
    return (
      this.listGenerationState.get(fieldId) || {
        fieldId,
        isRunning: false,
      }
    );
  }

  public getBrainstormSession(): BrainstormSession {
    return this.brainstormSession;
  }

  public cancelBrainstormGeneration() {
    const queueIndex = this.taskQueue.findIndex(
      (t) => t.type === "brainstorm",
    );
    if (queueIndex !== -1) {
      const task = this.taskQueue.splice(queueIndex, 1)[0];
      this.brainstormSession.isQueued = false;
      this.brainstormSession.isRunning = false;
      if (task.updateFn) task.updateFn();
      return;
    }

    if (this.brainstormSession.budgetResolver) {
      this.brainstormSession.budgetResolver();
    }
    if (this.brainstormSession.cancellationSignal) {
      this.brainstormSession.cancellationSignal.cancel();
    }
  }

  public cancelListGeneration(fieldId: string) {
    // Check queue first
    const queueIndex = this.taskQueue.findIndex(
      (t) => t.type === "list" && t.fieldId === fieldId
    );
    if (queueIndex !== -1) {
      const task = this.taskQueue.splice(queueIndex, 1)[0];
      const state = this.listGenerationState.get(fieldId);
      if (state) {
        state.isQueued = false;
        state.isRunning = false;
      }
      if (task.updateFn) task.updateFn();
      return;
    }

    const state = this.listGenerationState.get(fieldId);
    if (state) {
      if (state.budgetResolver) {
        state.budgetResolver(); // Unblock budget wait
      }
      if (state.cancellationSignal) {
        state.cancellationSignal.cancel();
      }
    }
  }

  public cancelFieldGeneration(fieldId: string) {
    // Check queue first
    const queueIndex = this.taskQueue.findIndex(
      (t) => t.type === "field" && t.fieldId === fieldId
    );
    if (queueIndex !== -1) {
      const task = this.taskQueue.splice(queueIndex, 1)[0];
      const session = this.getSession(fieldId);
      if (session) {
        session.isQueued = false;
      }
      if (task.updateFn) task.updateFn();
      return;
    }

    const session = this.getSession(fieldId);
    if (session) {
      if (session.budgetResolver) {
        session.budgetResolver(); // Unblock budget wait
      }
      if (session.cancellationSignal) {
        session.cancellationSignal.cancel();
      }
    }
  }

  public requestBrainstormGeneration(
    isInitial: boolean,
    onDelta: (text: string) => void,
    updateFn: () => void,
  ) {
    const session = this.brainstormSession;
    session.error = undefined;

    const wrappedUpdate = () => {
      updateFn();
      this.notify("brainstorm");
    };

    if (this.isGlobalGenerating || session.isRunning) {
      session.isQueued = true;
      this.taskQueue.push({
        type: "brainstorm",
        isInitial,
        onDelta,
        updateFn: wrappedUpdate,
      });
      wrappedUpdate();
    } else {
      this.isGlobalGenerating = true;
      this.executeBrainstorm(session, isInitial, onDelta, wrappedUpdate).finally(
        () => this.processQueue(),
      );
    }
  }

  private async executeBrainstorm(
    session: BrainstormSession,
    isInitial: boolean,
    onDelta: (text: string) => void,
    updateFn: () => void,
  ) {
    session.isRunning = true;
    session.isQueued = false;
    session.budgetWaitTime = undefined;
    session.budgetTimeRemaining = undefined;
    session.budgetWaitEndTime = undefined;
    updateFn();

    try {
      session.cancellationSignal = await api.v1.createCancellationSignal();
      await this.brainstormService.generateResponse(
        isInitial,
        onDelta,
        session.cancellationSignal,
        {
          onBudgetWait: (_1, _2, time) => {
            return new Promise<void>((resolve) => {
              session.budgetResolver = () => {
                session.budgetState = "waiting_for_timer";
                if (session.budgetWaitEndTime) {
                  // Start timer
                  const checkTimer = () => {
                    if (
                      !session.isRunning ||
                      session.budgetState !== "waiting_for_timer" ||
                      !session.budgetWaitEndTime
                    )
                      return;
                    const now = Date.now();
                    const remaining = Math.ceil(
                      Math.max(0, session.budgetWaitEndTime - now) / 1000,
                    );
                    session.budgetTimeRemaining = remaining;
                    updateFn();
                    if (remaining > 0)
                      api.v1.timers.setTimeout(checkTimer, 1000);
                  };
                  checkTimer();
                }
                updateFn();
                resolve();
              };
              session.budgetState = "waiting_for_user";
              session.budgetWaitTime = time;
              session.budgetWaitEndTime = Date.now() + time;
              updateFn();
            });
          },
          onBudgetResume: () => {
            session.budgetState = "normal";
            session.budgetTimeRemaining = undefined;
            updateFn();
          },
        },
      );
    } catch (e: any) {
      if (e !== "Cancelled") {
        session.error = e.message || String(e);
      }
    } finally {
      session.isRunning = false;
      session.cancellationSignal = undefined;
      updateFn();
    }
  }


  public requestListGeneration(fieldId: string, updateFn: () => void) {
    const state = this.getListGenerationState(fieldId);
    state.error = undefined;
    this.listGenerationState.set(fieldId, state);

    const wrappedUpdate = () => {
      updateFn();
      this.notify(fieldId);
    };

    if (this.isGlobalGenerating || state.isRunning) {
      state.isQueued = true;
      this.taskQueue.push({ type: "list", fieldId, updateFn: wrappedUpdate });
      wrappedUpdate();
    } else {
      this.isGlobalGenerating = true;
      this.listService
        .run(fieldId, state, wrappedUpdate)
        .finally(() => this.processQueue());
    }
  }

  public requestFieldGeneration(fieldId: string, updateFn: () => void) {
    const session = this.getSession(fieldId) || this.startSession(fieldId);
    session.error = undefined;

    const wrappedUpdate = () => {
      updateFn();
      this.notify(fieldId);
    };

    if (this.isGlobalGenerating || session.isRunning) {
      session.isQueued = true;
      this.taskQueue.push({ type: "field", fieldId, updateFn: wrappedUpdate });
      wrappedUpdate();
    } else {
      this.isGlobalGenerating = true;
      this.fieldService
        .run(session, wrappedUpdate)
        .finally(() => this.processQueue());
    }
  }

  private async processQueue() {
    if (this.taskQueue.length === 0) {
      this.isGlobalGenerating = false;
      return;
    }

    const nextTask = this.taskQueue.shift();
    if (!nextTask) {
      this.isGlobalGenerating = false;
      return;
    }

    if (nextTask.type === "field") {
      const session = this.getSession(nextTask.fieldId);
      if (session) {
        session.isQueued = false;
        nextTask.updateFn(); // Update UI to show running
        await this.fieldService.run(session, nextTask.updateFn);
      }
    } else if (nextTask.type === "list") {
      const state = this.getListGenerationState(nextTask.fieldId);
      if (state) {
        state.isQueued = false;
        nextTask.updateFn();
        await this.listService.run(nextTask.fieldId, state, nextTask.updateFn);
      }
    } else if (nextTask.type === "brainstorm") {
      const session = this.brainstormSession;
      session.isQueued = false;
      nextTask.updateFn();
      await this.executeBrainstorm(
        session,
        nextTask.isInitial,
        nextTask.onDelta,
        nextTask.updateFn,
      );
    }
    
    // Process next item recursively (since run awaited)
    this.processQueue();
  }
}
