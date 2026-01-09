import { StoryManager } from "./story-manager";
import { AgentWorkflowService } from "./agent-workflow";
import { FIELD_CONFIGS, FieldID } from "../config/field-definitions";

export interface SegaItem {
  id: string; // fieldId or lorebook:entryId
  label: string;
  type: "field" | "lorebook";
  status: "checked" | "blank" | "queued" | "generating" | "error";
  error?: string;
  categoryId?: string;
}

export class SegaService {
  private _items: SegaItem[] = [];
  private _isRunning: boolean = false;

  private updateCallback?: () => void;

  constructor(
    private storyManager: StoryManager,
    private agentWorkflow: AgentWorkflowService,
  ) {
    // Listen for new DULFS items/Lorebooks
    this.storyManager.subscribe(() => this.checkForNewItems());

    // Subscribe to workflow updates
    this.agentWorkflow.subscribe((fieldId) => {
      this.syncItemStatus(fieldId);
      if (this.updateCallback) this.updateCallback();
    });
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
    return this._items.find((i) => i.status === "generating")?.id;
  }

  public initialize() {
    this._items = [];

    // 1. Add all structured fields
    for (const config of FIELD_CONFIGS) {
      if (config.id === FieldID.Brainstorm) continue; // Skip Brainstorm

      const content = this.storyManager.getFieldContent(config.id);
      const dulfsList = this.storyManager.getDulfsList(config.id);
      let hasContent =
        (content && content.trim().length > 0) || dulfsList.length > 0;

      this._items.push({
        id: config.id,
        label: config.label,
        type: "field",
        status: hasContent ? "checked" : "blank",
        categoryId: config.id,
      });
    }

    // 2. Add existing Lorebooks managed by Story Engine
    this.scanForLorebooks();
  }

  private scanForLorebooks() {
    const dulfsFields = FIELD_CONFIGS.filter((c) => c.layout === "list");
    const foundItems: SegaItem[] = [];

    for (const config of dulfsFields) {
      const list = this.storyManager.getDulfsList(config.id);
      for (const item of list) {
        if (item.linkedLorebooks && item.linkedLorebooks.length > 0) {
          for (const entryId of item.linkedLorebooks) {
            const id = `lorebook:${entryId}`;
            if (this._items.find((i) => i.id === id)) continue;
            // Also check if we already found it in this pass (duplicate guard)
            if (foundItems.find((i) => i.id === id)) continue;

            const content = this.storyManager.getFieldContent(id);
            const hasContent = content && content.trim().length > 0;

            foundItems.push({
              id,
              label: `${item.name} (${config.label})`,
              type: "lorebook",
              status: hasContent ? "checked" : "blank",
              categoryId: config.id,
            });
          }
        }
      }
    }

    // Interleave lorebooks to ensure display order matches execution
    const interleaved = this.interleaveItems(foundItems);
    this._items.push(...interleaved);
  }

  private interleaveItems(items: SegaItem[]): SegaItem[] {
    const groups = new Map<string, SegaItem[]>();
    const categories: string[] = [];

    for (const item of items) {
      const cat = item.categoryId || "other";
      if (!groups.has(cat)) {
        groups.set(cat, []);
        categories.push(cat);
      }
      groups.get(cat)!.push(item);
    }

    const interleaved: SegaItem[] = [];
    let maxLen = 0;
    for (const group of groups.values()) {
      if (group.length > maxLen) maxLen = group.length;
    }

    for (let i = 0; i < maxLen; i++) {
      for (const cat of categories) {
        const group = groups.get(cat)!;
        if (i < group.length) {
          interleaved.push(group[i]);
        }
      }
    }
    return interleaved;
  }

  private syncItemStatus(fieldId: string) {
    const item = this._items.find((i) => i.id === fieldId);
    if (!item) return;

    const config = FIELD_CONFIGS.find((c) => c.id === fieldId);
    const isList = config?.layout === "list";

    if (isList) {
      const state = this.agentWorkflow.getListGenerationState(fieldId);
      if (state.isRunning) item.status = "generating";
      else if (state.isQueued) item.status = "queued";
      else if (state.error) {
        item.status = "error";
        item.error = state.error;
      } else {
        const content = this.storyManager.getDulfsList(fieldId);
        item.status = content.length > 0 ? "checked" : "blank";
      }
    } else {
      const session = this.agentWorkflow.getSession(fieldId);
      
      if (session?.isRunning) {
        item.status = "generating";
      } else if (session?.isQueued) {
        item.status = "queued";
      } else if (session?.error) {
        item.status = "error";
        item.error = session.error;
      } else {
        const content = this.storyManager.getFieldContent(fieldId);
        item.status =
          content && content.trim().length > 0 ? "checked" : "blank";
      }
    }

    this.checkPhaseTransition();
    this.checkGlobalCompletion();
  }

  private hasActiveFields(): boolean {
    return this._items.some(
      (i) =>
        i.type === "field" &&
        (i.status === "generating" || i.status === "queued"),
    );
  }

  private checkPhaseTransition() {
    if (!this._isRunning) return;

    // Check if any fields are still active
    const active = this.hasActiveFields();
    if (active) return;

    // Phase 1 (Fields) is complete.
    // Now discover new lorebooks (Wait to discover)
    this.checkForNewItems();

    // Now queue any blank lorebooks (Wait to queue)
    const blankLorebooks = this._items.filter(
      (i) => i.type === "lorebook" && i.status === "blank",
    );

    if (blankLorebooks.length > 0) {
      for (const lb of blankLorebooks) {
        this.triggerItem(lb);
      }
    }
  }

  private checkGlobalCompletion() {
    if (!this._isRunning) return;

    const hasActive = this._items.some(
      (i) => i.status === "queued" || i.status === "generating",
    );
    if (!hasActive) {
      this._isRunning = false;
      api.v1.ui.toast("S.E.G.A. Cycle Complete!", { type: "success" });
    }
  }

  private checkForNewItems() {
    // If we are running and still in Field phase, DO NOT discover/queue lorebooks yet.
    if (this._isRunning && this.hasActiveFields()) {
      return;
    }

    if (this._items.length === 0) return;

    const dulfsFields = FIELD_CONFIGS.filter((c) => c.layout === "list");
    let changed = false;
    const newItems: SegaItem[] = [];

    for (const config of dulfsFields) {
      const list = this.storyManager.getDulfsList(config.id);
      for (const item of list) {
        if (item.linkedLorebooks && item.linkedLorebooks.length > 0) {
          for (const entryId of item.linkedLorebooks) {
            const id = `lorebook:${entryId}`;
            if (this._items.find((i) => i.id === id)) continue;
            if (newItems.find((i) => i.id === id)) continue;

            const content = this.storyManager.getFieldContent(id);
            const hasContent = content && content.trim().length > 0;

            const itemToPush: SegaItem = {
              id,
              label: `${item.name}`,
              type: "lorebook",
              status: hasContent ? "checked" : "blank",
              categoryId: config.id,
            };
            newItems.push(itemToPush);
          }
        }
      }
    }

    const interleavedNew = this.interleaveItems(newItems);
    for (const item of interleavedNew) {
      this._items.push(item);
      changed = true;
      // We do not trigger here. checkPhaseTransition triggers them if running.
    }

    if (changed && this.updateCallback) {
      this.updateCallback();
    }
  }

  public startQueue() {
    if (this._isRunning) return;

    const itemsToQueue = this._items.filter((i) => i.status === "blank");
    if (itemsToQueue.length === 0) return;

    const fields = itemsToQueue.filter((i) => i.type === "field");
    const lorebooks = itemsToQueue.filter((i) => i.type === "lorebook");

    // Interleave fields (for robustness)
    const interleavedFields = this.interleaveItems(fields);

    // If we have fields, queue them. Lorebooks will be picked up by checkPhaseTransition when fields finish.
    if (interleavedFields.length > 0) {
      this._isRunning = true;
      for (const item of interleavedFields) {
        this.triggerItem(item);
      }
    } else if (lorebooks.length > 0) {
      // If no fields, start lorebooks directly
      const interleavedLorebooks = this.interleaveItems(lorebooks);
      this._isRunning = true;
      for (const item of interleavedLorebooks) {
        this.triggerItem(item);
      }
    }

    if (this._isRunning && this.updateCallback) this.updateCallback();
  }

  private triggerItem(item: SegaItem) {
    const isList =
      FIELD_CONFIGS.find((c) => c.id === item.id)?.layout === "list";
    if (isList) {
      this.agentWorkflow.requestListGeneration(item.id, () => {});
    } else {
      this.agentWorkflow.requestFieldGeneration(item.id, () => {});
    }
  }

  public cancel() {
    this._isRunning = false;
    for (const item of this._items) {
      if (item.status === "generating" || item.status === "queued") {
        const isList =
          FIELD_CONFIGS.find((c) => c.id === item.id)?.layout === "list";
        if (isList) {
          this.agentWorkflow.cancelListGeneration(item.id);
        } else {
          this.agentWorkflow.cancelFieldGeneration(item.id);
        }
        // Status will be updated via workflow subscription
      }
    }
    if (this.updateCallback) this.updateCallback();
  }

  public toggleItem(id: string) {
    if (this._isRunning) return;
    const item = this._items.find((i) => i.id === id);
    if (item) {
      if (item.status === "checked") item.status = "blank";
      else if (item.status === "blank") item.status = "checked";
    }
    if (this.updateCallback) this.updateCallback();
  }
}
