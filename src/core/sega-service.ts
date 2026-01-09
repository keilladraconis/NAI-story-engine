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
      });
    }

    // 2. Add existing Lorebooks managed by Story Engine
    this.scanForLorebooks();
  }

  private scanForLorebooks() {
    const dulfsFields = FIELD_CONFIGS.filter((c) => c.layout === "list");

    for (const config of dulfsFields) {
      const list = this.storyManager.getDulfsList(config.id);
      for (const item of list) {
        if (item.linkedLorebooks && item.linkedLorebooks.length > 0) {
          for (const entryId of item.linkedLorebooks) {
            const id = `lorebook:${entryId}`;
            if (this._items.find((i) => i.id === id)) continue;

            const content = this.storyManager.getFieldContent(id);
            const hasContent = content && content.trim().length > 0;

            this._items.push({
              id,
              label: `${item.name} (${config.label})`,
              type: "lorebook",
              status: hasContent ? "checked" : "blank",
            });
          }
        }
      }
    }
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
      if (session?.isRunning) item.status = "generating";
      else if (session?.isQueued) item.status = "queued";
      else if (session?.error) {
        item.status = "error";
        item.error = session.error;
      } else {
        const content = this.storyManager.getFieldContent(fieldId);
        item.status =
          content && content.trim().length > 0 ? "checked" : "blank";
      }
    }

    this.checkGlobalCompletion();
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
    if (this._items.length === 0) return;

    const dulfsFields = FIELD_CONFIGS.filter((c) => c.layout === "list");
    let changed = false;

    for (const config of dulfsFields) {
      const list = this.storyManager.getDulfsList(config.id);
      for (const item of list) {
        if (item.linkedLorebooks && item.linkedLorebooks.length > 0) {
          for (const entryId of item.linkedLorebooks) {
            const id = `lorebook:${entryId}`;
            if (this._items.find((i) => i.id === id)) continue;

            const content = this.storyManager.getFieldContent(id);
            const hasContent = content && content.trim().length > 0;

            const itemToPush: SegaItem = {
              id,
              label: `${item.name}`,
              type: "lorebook",
              status: hasContent ? "checked" : "blank",
            };

            this._items.push(itemToPush);
            changed = true;

            if (this._isRunning && !hasContent) {
              this.triggerItem(itemToPush);
            }
          }
        }
      }
    }

    if (changed && this.updateCallback) {
      this.updateCallback();
    }
  }

  public startQueue() {
    if (this._isRunning) return;

    let hasWork = false;
    for (const item of this._items) {
      if (item.status === "blank") {
        hasWork = true;
        this.triggerItem(item);
      }
    }

    if (hasWork) {
      this._isRunning = true;
      if (this.updateCallback) this.updateCallback();
    }
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
