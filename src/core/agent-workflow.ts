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

export {
  GenerationSession,
  FieldSession,
  ListSession,
  BrainstormSession,
} from "./generation-types";

export class AgentWorkflowService {
  private sessions: Map<string, GenerationSession> = new Map();
  // We keep list state separately for UI tracking of "is list generating?"
  private listGenerationState: Map<string, GenerationSession> = new Map();
  private activeListTasks: Map<string, Set<GenerationSession>> = new Map();

  private brainstormSession: GenerationSession = {
    id: "brainstorm-session",
    fieldId: "brainstorm",
    type: "brainstorm",
    isRunning: false,
  };
  private listeners: Array<(fieldId: string) => void> = [];

  private generationService: UnifiedGenerationService;
  public brainstormService: BrainstormService; // Public for data ops
  private contextFactory: ContextStrategyFactory;

  constructor(storyManager: StoryManager) {
    this.contextFactory = new ContextStrategyFactory(storyManager);

    this.generationService = new UnifiedGenerationService(storyManager);
    this.generationService.subscribe((fieldId) => this.notify(fieldId));
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
    this.cancelSession(this.brainstormSession);
  }

  public cancelListGeneration(fieldId: string) {
    const tasks = this.activeListTasks.get(fieldId);
    if (tasks) {
      for (const session of tasks) {
        this.cancelSession(session);
      }
      // The finally block in requestListGeneration will handle state cleanup
    }
  }

  public cancelFieldGeneration(fieldId: string) {
    const session = this.sessions.get(fieldId);
    if (session) {
      this.cancelSession(session);
    }
  }

  private cancelSession(session: GenerationSession) {
    if (session.cancellationSignal) session.cancellationSignal.cancel();
    // Budget rejection happens via GenX signal handling mostly, but if manually waiting:
    if (session.budgetRejecter) session.budgetRejecter("Cancelled");
    this.notify(session.fieldId);
  }

  public requestBrainstormGeneration(isInitial: boolean) {
    const session = this.brainstormSession;
    session.error = undefined;
    session.isInitial = isInitial;
    session.outputBuffer = undefined; // Reset buffer

    const strategy = new BrainstormStrategy(this.contextFactory);
    this.runTask(session, strategy);
  }

  public requestListGeneration(fieldId: string) {
    // This is for Phase 1: Generating the list of NAMES
    const listState = this.getListGenerationState(fieldId);
    listState.error = undefined;
    listState.isRunning = true;
    this.listGenerationState.set(fieldId, listState);

    // Initial notify to show loading state
    this.notify(fieldId);

    const itemSession: GenerationSession = {
      id: api.v1.uuid(),
      fieldId: `${fieldId}:list-gen`, // Unique ID for the task
      dulfsFieldId: fieldId,
      type: "dulfs-item",
      isRunning: false,
    };

    // Track task
    let tasks = this.activeListTasks.get(fieldId);
    if (!tasks) {
      tasks = new Set();
      this.activeListTasks.set(fieldId, tasks);
    }
    tasks.add(itemSession);

    const strategy = new DulfsListStrategy(this.contextFactory);
    
    // Run and Cleanup
    this.runTask(itemSession, strategy).finally(() => {
      const currentTasks = this.activeListTasks.get(fieldId);
      if (currentTasks) {
        currentTasks.delete(itemSession);
        if (currentTasks.size === 0) {
           listState.isRunning = false;
           this.notify(fieldId);
        }
      }
    });
  }

  public requestDulfsSummaryGeneration(fieldId: string) {
    const sessionKey = `summary:${fieldId}`;
    const session =
      this.getSession(sessionKey) || this.startSession(sessionKey);
    session.error = undefined;
    session.dulfsFieldId = fieldId;
    session.type = "dulfs-summary";

    const strategy = new DulfsSummaryStrategy(this.contextFactory);
    this.runTask(session, strategy);
  }

  public requestDulfsContentGeneration(fieldId: string, itemId: string) {
    // This is for Phase 2: Generating CONTENT for a specific item
    // We track this session individually so we can show a spinner on the item
    const sessionKey = `${fieldId}:${itemId}`;
    const session =
      this.getSession(sessionKey) || this.startSession(sessionKey);
    session.error = undefined;
    session.dulfsFieldId = fieldId;
    session.dulfsItemId = itemId;
    session.type = "field"; // Treat as a field so it doesn't interfere with listState

    const strategy = new DulfsContentStrategy(this.contextFactory);
    this.runTask(session, strategy);
  }

  public requestFieldGeneration(fieldId: string) {
    const session = this.getSession(fieldId) || this.startSession(fieldId);
    session.error = undefined;

    const strategy = new FieldGenerationStrategy(this.contextFactory);
    this.runTask(session, strategy);
  }

  private async runTask(
    session: GenerationSession,
    strategy: GenerationStrategy,
  ) {
    try {
      await this.generationService.run(session, strategy);
    } catch (e) {
      // Error handling is mostly in generationService
      api.v1.log(`Task error for ${session.fieldId}:`, e);
    }
  }
}