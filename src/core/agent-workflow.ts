import { StoryManager } from "./story-manager";
import { ContextStrategyFactory } from "./context-strategies";
import { GenerationSession } from "./generation-types";
import {
  UnifiedGenerationService,
  FieldGenerationStrategy,
  DulfsListStrategy,
  DulfsContentStrategy,
  DulfsSummaryStrategy,
  BrainstormStrategy,
  GenerationStrategy,
} from "./unified-generation-service";
import { BrainstormService } from "./brainstorm-service";
import { GenX, QueueItem } from "../../lib/gen-x";

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

  private queueManager: GenX<Task>;

  private generationService: UnifiedGenerationService;
  public brainstormService: BrainstormService; // Public for data ops
  private contextFactory: ContextStrategyFactory;

  constructor(storyManager: StoryManager) {
    this.contextFactory = new ContextStrategyFactory(storyManager);

    this.generationService = new UnifiedGenerationService(storyManager);
    this.brainstormService = new BrainstormService(storyManager);

    this.queueManager = new GenX<Task>(async (item) => {
      const { session, strategy, updateFn } = item.data;
      session.isQueued = false;
      updateFn(); // Notify start

      try {
        await this.generationService.run(session, strategy, updateFn);
      } finally {
        // Check if this was a list item (Phase 1), and if it was the last one
        if (session.type === "dulfs-item" && session.dulfsFieldId) {
          const queue = this.queueManager.getQueue();
          const remainingForList = queue.filter(
            (t) =>
              t.data.session.dulfsFieldId === session.dulfsFieldId &&
              t.data.session.type === "dulfs-item",
          ).length;
          if (remainingForList === 0) {
            const listState = this.listGenerationState.get(
              session.dulfsFieldId,
            );
            if (listState) {
              listState.isRunning = false;
              this.notify(session.dulfsFieldId);
            }
          }
        }
      }
    });

    // Propagate queue events to listeners
    this.queueManager.subscribe((_, item) => {
      if (item) {
        this.notify(item.data.session.fieldId);
      }
    });
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
    const cancelled = this.queueManager.cancel(
      (item) => item.data.session.dulfsFieldId === fieldId,
    );
    this.handleCancelledTasks(cancelled);

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
    const cancelled = this.queueManager.cancel(
      (item) => item.data.session.fieldId === targetId,
    );
    this.handleCancelledTasks(cancelled);
  }

  private handleCancelledTasks(items: QueueItem<Task>[]) {
    for (const item of items) {
      const { session, updateFn } = item.data;
      session.isQueued = false;

      // Stop timer/budget wait
      if (session.budgetRejecter) {
        session.budgetRejecter("Cancelled");
      } else if (session.budgetResolver) {
        session.budgetResolver();
      }

      // Stop generation
      if (session.cancellationSignal) {
        session.cancellationSignal.cancel();
      }

      // Force stop BudgetTimer loop if active
      session.isRunning = false;

      updateFn();
    }
  }

  public requestBrainstormGeneration(
    isInitial: boolean,
    updateFn: () => void = () => {},
  ) {
    const session = this.brainstormSession;
    session.error = undefined;
    session.isInitial = isInitial;
    session.outputBuffer = undefined; // Reset buffer

    const wrappedUpdate = () => {
      updateFn();
      this.notify("brainstorm");
    };

    const strategy = new BrainstormStrategy(this.contextFactory);

    this.queueTask(session, strategy, wrappedUpdate);
  }

  public requestListGeneration(fieldId: string, updateFn: () => void = () => {}) {
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

  public requestDulfsSummaryGeneration(
    fieldId: string,
    updateFn: () => void = () => {},
  ) {
    const sessionKey = `summary:${fieldId}`;
    const session =
      this.getSession(sessionKey) || this.startSession(sessionKey);
    session.error = undefined;
    session.dulfsFieldId = fieldId;
    session.type = "dulfs-summary";

    const wrappedUpdate = () => {
      updateFn();
      this.notify(fieldId);
    };

    const strategy = new DulfsSummaryStrategy(this.contextFactory);
    this.queueTask(session, strategy, wrappedUpdate);
  }

  public requestDulfsContentGeneration(
    fieldId: string,
    itemId: string,
    updateFn: () => void = () => {},
  ) {
    // This is for Phase 2: Generating CONTENT for a specific item
    // We track this session individually so we can show a spinner on the item
    const sessionKey = `${fieldId}:${itemId}`;
    const session =
      this.getSession(sessionKey) || this.startSession(sessionKey);
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

  public requestFieldGeneration(fieldId: string, updateFn: () => void = () => {}) {
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
    session.isQueued = true;
    this.queueManager.enqueue({
      id: session.fieldId,
      data: { session, strategy, updateFn },
    });
    updateFn();
  }
}
