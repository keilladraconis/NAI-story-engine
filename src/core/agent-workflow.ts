import { StoryManager } from "./story-manager";
import { ContextStrategyFactory } from "./context-strategies";
import { GenerationSession } from "./generation-types";
import {
  UnifiedGenerationService,
  FieldGenerationStrategy,
  DulfsListStrategy,
  DulfsContentStrategy,
  BrainstormStrategy,
  GenerationStrategy,
} from "./unified-generation-service";
import { BrainstormService } from "./brainstorm-service";

export {
  GenerationSession,
  FieldSession,
  ListSession,
  BrainstormSession,
} from "./generation-types";

interface Task {
  session: GenerationSession;
  strategy: GenerationStrategy;
  updateFn: () => void;
}

export class AgentWorkflowService {
  private sessions: Map<string, GenerationSession> = new Map();
  // We keep list state separately for UI tracking of "is list generating?"
  private listGenerationState: Map<string, GenerationSession> = new Map();
  private brainstormSession: GenerationSession = {
    id: "brainstorm-session",
    fieldId: "brainstorm",
    type: "brainstorm",
    isRunning: false,
  };
  private listeners: Array<(fieldId: string) => void> = [];

  private taskQueue: Array<Task> = [];
  private isGlobalGenerating: boolean = false;

  private generationService: UnifiedGenerationService;
  public brainstormService: BrainstormService; // Public for data ops
  private contextFactory: ContextStrategyFactory;

  constructor(storyManager: StoryManager) {
    this.contextFactory = new ContextStrategyFactory(storyManager);

    this.generationService = new UnifiedGenerationService(
      storyManager,
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

  public getSession(fieldId: string): GenerationSession | undefined {
    return this.sessions.get(fieldId);
  }

  public startSession(fieldId: string): GenerationSession {
    const session: GenerationSession = {
      id: api.v1.uuid(),
      fieldId,
      type: "field",
      isRunning: false,
    };
    this.sessions.set(fieldId, session);
    return session;
  }

  public getListGenerationState(fieldId: string): GenerationSession {
    return (
      this.listGenerationState.get(fieldId) || {
        id: fieldId + "-list-state",
        fieldId,
        type: "dulfs-item", // Placeholder type
        isRunning: false,
      }
    );
  }

  public getBrainstormSession(): GenerationSession {
    return this.brainstormSession;
  }

  public cancelBrainstormGeneration() {
    this.cancelTask(this.brainstormSession.fieldId);
  }

  public cancelListGeneration(fieldId: string) {
    // Cancel all tasks for this list field
    this.taskQueue = this.taskQueue.filter((t) => {
      if (t.session.dulfsFieldId === fieldId) {
        if (t.updateFn) t.updateFn();
        return false;
      }
      return true;
    });

    const listState = this.listGenerationState.get(fieldId);
    if (listState) {
        listState.isRunning = false;
        listState.isQueued = false;
        this.listGenerationState.set(fieldId, listState);
        this.notify(fieldId);
    }
  }

  public cancelFieldGeneration(fieldId: string) {
    this.cancelTask(fieldId);
  }
  
  private cancelTask(targetId: string) {
      // Remove from queue
      const queueIndex = this.taskQueue.findIndex(t => t.session.fieldId === targetId);
      if (queueIndex !== -1) {
          const task = this.taskQueue.splice(queueIndex, 1)[0];
          task.session.isQueued = false;
          task.updateFn();
          return;
      }
      
      // If running
      const session = this.sessions.get(targetId); // For fields
      if (session) {
           if (session.budgetRejecter) {
            session.budgetRejecter("Cancelled");
          } else if (session.budgetResolver) {
            session.budgetResolver();
          }
          if (session.cancellationSignal) {
            session.cancellationSignal.cancel();
          }
      } else if (targetId === "brainstorm") {
          const bSession = this.brainstormSession;
          if (bSession.budgetRejecter) {
            bSession.budgetRejecter("Cancelled");
          } else if (bSession.budgetResolver) {
            bSession.budgetResolver();
          }
          if (bSession.cancellationSignal) {
            bSession.cancellationSignal.cancel();
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
    session.isInitial = isInitial;

    const wrappedUpdate = () => {
      updateFn();
      this.notify("brainstorm");
    };

    const strategy = new BrainstormStrategy(this.contextFactory, onDelta);

    this.queueTask(session, strategy, wrappedUpdate);
  }

  public requestListGeneration(fieldId: string, updateFn: () => void) {
    // This is for Phase 1: Generating the list of NAMES
    const listState = this.getListGenerationState(fieldId);
    listState.error = undefined;
    listState.isRunning = true;
    this.listGenerationState.set(fieldId, listState);

    const wrappedUpdate = () => {
      // If the task is done (not in queue, not running), update state
      // Logic handled in executeTask finally block
      updateFn();
      this.notify(fieldId);
    };

    const itemSession: GenerationSession = {
      id: api.v1.uuid(),
      fieldId: `${fieldId}:list-gen`, // Unique ID for the task
      dulfsFieldId: fieldId,
      type: "dulfs-item", // Re-using type or should I change?
      // Note: "dulfs-item" type triggers the finally block logic to clear listState.
      // This is exactly what we want for the main list generation button.
      isRunning: false,
    };

    const strategy = new DulfsListStrategy(this.contextFactory);
    this.queueTask(itemSession, strategy, wrappedUpdate);
    
    wrappedUpdate();
  }

  public requestDulfsContentGeneration(
    fieldId: string,
    itemId: string,
    updateFn: () => void
  ) {
    // This is for Phase 2: Generating CONTENT for a specific item
    // We track this session individually so we can show a spinner on the item
    const sessionKey = `${fieldId}:${itemId}`;
    const session = this.getSession(sessionKey) || this.startSession(sessionKey);
    session.error = undefined;
    session.dulfsFieldId = fieldId;
    session.dulfsItemId = itemId;
    session.type = "field"; // Treat as a field so it doesn't interfere with listState
    
    const wrappedUpdate = () => {
      updateFn();
      this.notify(fieldId); // Notify the list field to re-render
    };

    const strategy = new DulfsContentStrategy(this.contextFactory);
    this.queueTask(session, strategy, wrappedUpdate);
  }

  public requestFieldGeneration(fieldId: string, updateFn: () => void) {
    const session = this.getSession(fieldId) || this.startSession(fieldId);
    session.error = undefined;

    const wrappedUpdate = () => {
      updateFn();
      this.notify(fieldId);
    };

    const strategy = new FieldGenerationStrategy(this.contextFactory);
    this.queueTask(session, strategy, wrappedUpdate);
  }

  private queueTask(
    session: GenerationSession,
    strategy: GenerationStrategy,
    updateFn: () => void,
  ) {
    if (this.isGlobalGenerating || session.isRunning) {
      session.isQueued = true;
      this.taskQueue.push({ session, strategy, updateFn });
      updateFn();
    } else {
      this.isGlobalGenerating = true;
      this.executeTask(session, strategy, updateFn);
    }
  }

  private async executeTask(
    session: GenerationSession,
    strategy: GenerationStrategy,
    updateFn: () => void,
  ) {
    session.isQueued = false;
    updateFn(); // Notify start

    try {
      await this.generationService.run(session, strategy, updateFn);
    } finally {
      // Check if this was a list item (Phase 1), and if it was the last one
      if (session.type === "dulfs-item" && session.dulfsFieldId) {
          const remainingForList = this.taskQueue.filter(t => t.session.dulfsFieldId === session.dulfsFieldId && t.session.type === "dulfs-item").length;
          if (remainingForList === 0) {
              const listState = this.listGenerationState.get(session.dulfsFieldId);
              if (listState) {
                  listState.isRunning = false;
                  this.notify(session.dulfsFieldId);
              }
          }
      }
      
      this.processQueue();
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

    await this.executeTask(
      nextTask.session,
      nextTask.strategy,
      nextTask.updateFn,
    );
  }
}