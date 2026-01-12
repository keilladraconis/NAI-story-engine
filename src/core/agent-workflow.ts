import { StoryManager } from "./story-manager";
import { ContextStrategyFactory } from "./context-strategies";
import { ContentParsingService } from "./content-parsing-service";
import { GenerationSession } from "./generation-types";
import {
  UnifiedGenerationService,
  FieldGenerationStrategy,
  DulfsItemStrategy,
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
  private parsingService: ContentParsingService;

  constructor(storyManager: StoryManager) {
    this.contextFactory = new ContextStrategyFactory(storyManager);
    this.parsingService = new ContentParsingService();

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
    // 1. Remove from queue
    this.taskQueue = this.taskQueue.filter((t) => {
      if (t.session.dulfsFieldId === fieldId) {
        if (t.updateFn) t.updateFn();
        return false;
      }
      return true;
    });

    // 2. Cancel running task if it matches
    const listState = this.listGenerationState.get(fieldId);
    if (listState) {
        // We can't cancel the *list state*, we must cancel the *active session*
        // But we don't track the active session ID for the list easily here.
        // However, UnifiedGenerationService.run respects cancellationSignal.
        // If we want to cancel the CURRENTLY running item for this list:
        // We need to find the session that is running and has dulfsFieldId === fieldId.
        // But we don't have a global running session list exposed.
        // Workaround: The `listState` we return to UI is just a state tracker.
        // To strictly cancel, we rely on the fact that `isGlobalGenerating` handles one task.
        // If the current task belongs to this list, cancel it.
        // This is complex.
        // Simpler: Just clear the queue (done above).
        // And if a task is running, we can't easily reach into it unless we stored the active session.
        // Let's rely on queue clearing. The current item will finish (or we could try to signal it).
        
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
    const listState = this.getListGenerationState(fieldId);
    listState.error = undefined;
    listState.isRunning = true;
    this.listGenerationState.set(fieldId, listState);

    const wrappedUpdate = () => {
      // Check if any tasks for this field are left in queue
      // Note: we check dulfsFieldId match
      const hasMore = this.taskQueue.some(
        (t) => t.session.dulfsFieldId === fieldId,
      );
      
      // If no more in queue, and the current task (if any) is finishing... 
      // Actually, wrappedUpdate is called BY the task.
      // If we are here, it means the task called update.
      // We don't know if the task is done or just streaming.
      // But `isRunning` on the *item session* will tell us.
      
      // BUT, we want to update the LIST state.
      // If queue is empty AND no item is currently running for this list?
      // Determining "currently running" is hard without tracking.
      
      // Simplified: We set listState.isRunning = true at start.
      // We rely on the queue processing to know when we are "done done"?
      // Or: We pass a "final" callback to the LAST task?
      
      // Alternative: Just update UI. The UI spins if listState.isRunning is true.
      // We need to set it to false eventually.
      // We can do this by checking the queue count in the *Queue Processor*.
      
      updateFn();
      this.notify(fieldId);
    };

    // Queue 3 items
    for (let i = 0; i < 3; i++) {
      const itemSession: GenerationSession = {
        id: api.v1.uuid(),
        fieldId: `${fieldId}:item:${api.v1.uuid()}`, // Unique ID for the task
        dulfsFieldId: fieldId,
        type: "dulfs-item",
        isRunning: false,
      };

      const strategy = new DulfsItemStrategy(
        this.contextFactory,
        this.parsingService,
      );
      
      this.queueTask(itemSession, strategy, wrappedUpdate);
    }
    
    wrappedUpdate();
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
      // Check if this was a list item, and if it was the last one
      if (session.type === "dulfs-item" && session.dulfsFieldId) {
          const remainingForList = this.taskQueue.filter(t => t.session.dulfsFieldId === session.dulfsFieldId).length;
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