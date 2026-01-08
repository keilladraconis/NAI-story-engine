import { StoryManager } from "./story-manager";
import { AgentWorkflowService } from "./agent-workflow";
import { FIELD_CONFIGS, FieldID } from "../config/field-definitions";

export interface SegaItem {
  id: string; // fieldId or lorebook:entryId
  label: string;
  type: "field" | "lorebook";
  status: "checked" | "blank" | "queued" | "generating" | "error";
  error?: string;
}

export class SegaService {
  private _items: SegaItem[] = [];
  private _isRunning: boolean = false;
  private _currentFieldId?: string;
  private _cancellationSignal?: CancellationSignal;
  
  private updateCallback?: () => void;

  constructor(
    private storyManager: StoryManager,
    private agentWorkflow: AgentWorkflowService
  ) {
    // Listen for new DULFS items/Lorebooks
    this.storyManager.subscribe(() => this.checkForNewItems());
  }

  public setUpdateCallback(cb: () => void) {
    this.updateCallback = cb;
  }

  public get items(): SegaItem[] {
    return this._items;
  }

  public get isRunning(): boolean {
    return this._isRunning;
  }

  public get currentFieldId(): string | undefined {
    return this._currentFieldId;
  }

  public initialize() {
    this._items = [];
    
    // 1. Add all structured fields
    for (const config of FIELD_CONFIGS) {
      if (config.id === FieldID.Brainstorm) continue; // Skip Brainstorm
      
      const content = this.storyManager.getFieldContent(config.id);
      const hasContent = content && content.trim().length > 0;
      
      this._items.push({
        id: config.id,
        label: config.label,
        type: "field",
        status: hasContent ? "checked" : "blank"
      });
    }

    // 2. Add existing Lorebooks managed by Story Engine
    // We scan DULFS lists for items with linked lorebooks
    this.scanForLorebooks();
  }

  private scanForLorebooks() {
    const dulfsFields = FIELD_CONFIGS.filter(c => c.layout === "list");
    
    for (const config of dulfsFields) {
      const list = this.storyManager.getDulfsList(config.id);
      for (const item of list) {
        if (item.linkedLorebooks && item.linkedLorebooks.length > 0) {
          for (const entryId of item.linkedLorebooks) {
            const id = `lorebook:${entryId}`;
            // Check if already in list
            if (this._items.find(i => i.id === id)) continue;

            // Check content
            const content = this.storyManager.getFieldContent(id);
            const hasContent = content && content.trim().length > 0;

            this._items.push({
              id,
              label: `${item.name} (${config.label})`, // e.g. "Gandalf (Dramatis Personae)"
              type: "lorebook",
              status: hasContent ? "checked" : "blank"
            });
          }
        }
      }
    }
  }

  private checkForNewItems() {
    // Only add new items if we are running or initialized
    if (this._items.length === 0) return;

    const dulfsFields = FIELD_CONFIGS.filter(c => c.layout === "list");
    let changed = false;

    for (const config of dulfsFields) {
      const list = this.storyManager.getDulfsList(config.id);
      for (const item of list) {
        if (item.linkedLorebooks && item.linkedLorebooks.length > 0) {
          for (const entryId of item.linkedLorebooks) {
            const id = `lorebook:${entryId}`;
            if (this._items.find(i => i.id === id)) continue;

            // New item found
            const content = this.storyManager.getFieldContent(id);
            const hasContent = content && content.trim().length > 0;
            
            // If running, auto-queue it if blank
            const status = this._isRunning && !hasContent ? "queued" : (hasContent ? "checked" : "blank");

            this._items.push({
              id,
              label: `${item.name}`,
              type: "lorebook",
              status
            });
            changed = true;
          }
        }
      }
    }

    if (changed && this.updateCallback) {
      this.updateCallback();
    }
  }

  public async startQueue() {
    if (this._isRunning) return;
    
    // Queue all blank items
    let hasWork = false;
    for (const item of this._items) {
      if (item.status === "blank") {
        item.status = "queued";
        hasWork = true;
      }
    }

    if (!hasWork) {
      // Nothing to do
      return;
    }

    this._isRunning = true;
    this._cancellationSignal = await api.v1.createCancellationSignal();
    if (this.updateCallback) this.updateCallback();

    this.processNext();
  }

  private async processNext() {
    if (!this._isRunning || (this._cancellationSignal && this._cancellationSignal.cancelled)) {
      this._isRunning = false;
      this._currentFieldId = undefined;
      // Reset queued items to blank
      this._items.forEach(i => {
        if (i.status === "queued" || i.status === "generating") i.status = "blank";
      });
      if (this.updateCallback) this.updateCallback();
      return;
    }

    const nextItem = this._items.find(i => i.status === "queued");
    if (!nextItem) {
      // Done!
      this._isRunning = false;
      this._currentFieldId = undefined;
      api.v1.ui.toast("S.E.G.A. Cycle Complete!", { type: "success" });
      if (this.updateCallback) this.updateCallback();
      return;
    }

    // Start generating
    nextItem.status = "generating";
    this._currentFieldId = nextItem.id;
    if (this.updateCallback) this.updateCallback();

    try {
      if (nextItem.type === "field" && FIELD_CONFIGS.find(c => c.id === nextItem.id)?.layout === "list") {
        // DULFS List Generation
        await new Promise<void>((resolve) => {
           // We need to wrap the updateFn to detect completion, but AgentWorkflow doesn't return a promise easily 
           // actually requestListGeneration takes an updateFn.
           
           // We'll poll or check state? 
           // Better: AgentWorkflowService._runListGeneration is async but requestListGeneration is void.
           // However, AgentWorkflowService manages the queue.
           // Since we want to control the queue *here* (SEGA is a master queue), we should ideally wait for the generation to finish.
           
           // But AgentWorkflowService is designed to run in background.
           // We can't await `requestListGeneration`. 
           
           // Hack: We can poll the session state.
           this.agentWorkflow.requestListGeneration(nextItem.id, () => {
             // This updateFn is called on state changes.
             const state = this.agentWorkflow.getListGenerationState(nextItem.id);
             if (this.updateCallback) this.updateCallback(); // Update our UI to reflect budget states from underlying service
             
             if (!state.isRunning && !state.isQueued) {
                // Finished
                resolve();
             }
           });
        });
      } else {
        // Text Field Generation (or Lorebook)
        await new Promise<void>((resolve) => {
           this.agentWorkflow.requestFieldGeneration(nextItem.id, () => {
             const session = this.agentWorkflow.getSession(nextItem.id);
             if (this.updateCallback) this.updateCallback();

             if (session && !session.isRunning && !session.isQueued) {
               resolve();
             }
           });
        });
      }

      // Check content to confirm success (optional, but good for status)
      // const content = this.storyManager.getFieldContent(nextItem.id);
      // For DULFS, "content" isn't the list, but we assume success if it finished without error.
      // Ideally we'd check if list has items.
      
      nextItem.status = "checked";
    } catch (e: any) {
      api.v1.log(e);
      nextItem.status = "error";
      nextItem.error = e.message;
    } finally {
      this._currentFieldId = undefined;
      // Small delay to let UI settle?
      await new Promise<void>(r => api.v1.timers.setTimeout(() => r(), 100));
      this.processNext();
    }
  }

  public cancel() {
    this._isRunning = false;
    if (this._cancellationSignal) this._cancellationSignal.cancel();
    
    if (this._currentFieldId) {
        // Cancel the underlying generation
        if (FIELD_CONFIGS.find(c => c.id === this._currentFieldId)?.layout === "list") {
            this.agentWorkflow.cancelListGeneration(this._currentFieldId);
        } else {
            this.agentWorkflow.cancelFieldGeneration(this._currentFieldId);
        }
    }

    // Reset queue
     this._items.forEach(i => {
        if (i.status === "queued" || i.status === "generating") i.status = "blank";
      });
      
    if (this.updateCallback) this.updateCallback();
  }

  public toggleItem(id: string) {
    if (this._isRunning) return; // Locked while running
    const item = this._items.find(i => i.id === id);
    if (item) {
      if (item.status === "checked") item.status = "blank";
      else if (item.status === "blank") item.status = "checked";
      // Ignore others
    }
    if (this.updateCallback) this.updateCallback();
  }
}
