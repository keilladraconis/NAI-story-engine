import { StoryManager } from "./story-manager";
import { ContextStrategyFactory } from "./context-strategies";
import { ContentParsingService } from "./content-parsing-service";
import { FieldSession, ListSession } from "./generation-types";
import { FieldGenerationService } from "./field-generation-service";
import { ListGenerationService } from "./list-generation-service";

export { FieldSession, ListSession } from "./generation-types";

export class AgentWorkflowService {
  private sessions: Map<string, FieldSession> = new Map();
  private listGenerationState: Map<string, ListSession> = new Map();
  private listeners: Array<(fieldId: string) => void> = [];

  private taskQueue: Array<
    | { type: "field"; fieldId: string; updateFn: () => void }
    | { type: "list"; fieldId: string; updateFn: () => void }
  > = [];
  private isGlobalGenerating: boolean = false;

  private fieldService: FieldGenerationService;
  private listService: ListGenerationService;

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
    }
    
    // Process next item recursively (since run awaited)
    this.processQueue();
  }
}
