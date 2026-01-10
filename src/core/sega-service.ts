import { StoryManager } from "./story-manager";
import { AgentWorkflowService } from "./agent-workflow";
import { FIELD_CONFIGS, FieldID } from "../config/field-definitions";

export class SegaService {
  private _isRunning: boolean = false;
  private currentSegaId?: string;
  private updateCallback?: () => void;

  constructor(
    private storyManager: StoryManager,
    private agentWorkflow: AgentWorkflowService,
  ) {
    // Subscribe to workflow updates to track completion
    this.agentWorkflow.subscribe((fieldId) => this.onWorkflowUpdate(fieldId));
  }

  public setUpdateCallback(cb: () => void) {
    this.updateCallback = cb;
  }

  public get isRunning(): boolean {
    return this._isRunning;
  }

  public toggle() {
    if (this._isRunning) {
      this.stop();
    } else {
      this.start();
    }
  }

  public start() {
    if (this._isRunning) return;
    this._isRunning = true;
    api.v1.ui.toast("S.E.G.A. Background Generation Started");
    this.tryNext();
    if (this.updateCallback) this.updateCallback();
  }

  public stop() {
    if (!this._isRunning) return;
    this._isRunning = false;
    api.v1.ui.toast("S.E.G.A. Stopped");

    // Cancel current item if it was started by SEGA
    if (this.currentSegaId) {
      const isList = FIELD_CONFIGS.some(
        (c) => c.id === this.currentSegaId && c.layout === "list",
      );
      if (isList) {
        this.agentWorkflow.cancelListGeneration(this.currentSegaId);
      } else {
        this.agentWorkflow.cancelFieldGeneration(this.currentSegaId);
      }
      this.currentSegaId = undefined;
    }

    if (this.updateCallback) this.updateCallback();
  }

  private onWorkflowUpdate(fieldId: string) {
    if (!this._isRunning) return;

    // We only care if the updated field is the one we are currently managing
    if (fieldId === this.currentSegaId) {
      const isList = FIELD_CONFIGS.some(
        (c) => c.id === fieldId && c.layout === "list",
      );
      let isActive = false;
      let budgetResolver: (() => void) | undefined;
      let budgetState: string | undefined;

      if (isList) {
        const state = this.agentWorkflow.getListGenerationState(fieldId);
        isActive = state.isRunning || state.isQueued || false;
        budgetResolver = state.budgetResolver;
        budgetState = state.budgetState;
      } else {
        const session = this.agentWorkflow.getSession(fieldId);
        isActive = session?.isRunning || session?.isQueued || false;
        budgetResolver = session?.budgetResolver;
        budgetState = session?.budgetState;
      }

      // Auto-resolve budget wait for S.E.G.A. items
      if (isActive && budgetState === "waiting_for_user" && budgetResolver) {
        budgetResolver();
        return;
      }

      if (!isActive) {
        // Generation finished, errored, or was cancelled
        this.currentSegaId = undefined;
        // Wait a brief moment before trying the next one to allow UI updates/cleanup
        api.v1.timers.setTimeout(() => this.tryNext(), 1000);
      }
    }
  }

  private tryNext() {
    if (!this._isRunning) return;
    if (this.currentSegaId) return; // Already busy

    const candidates = this.findBlankItems();
    if (candidates.length === 0) {
      this._isRunning = false;
      api.v1.ui.toast("S.E.G.A. Cycle Complete - No more blank fields!", {
        type: "success",
      });
      if (this.updateCallback) this.updateCallback();
      return;
    }

    // Random selection
    const randomIdx = Math.floor(Math.random() * candidates.length);
    const nextId = candidates[randomIdx];
    this.currentSegaId = nextId;

    // Provide feedback
    const label = this.getLabelForId(nextId);
    api.v1.ui.toast(`S.E.G.A. Generating: ${label}`, { type: "info" });

    // Trigger generation
    const isList = FIELD_CONFIGS.some(
      (c) => c.id === nextId && c.layout === "list",
    );
    if (isList) {
      this.agentWorkflow.requestListGeneration(nextId, () => {});
    } else {
      this.agentWorkflow.requestFieldGeneration(nextId, () => {});
    }
  }

  private getLabelForId(id: string): string {
    const config = FIELD_CONFIGS.find((c) => c.id === id);
    if (config) return config.label;

    if (id.startsWith("lorebook:")) {
      const entryId = id.split(":")[1];
      const match = this.storyManager.findDulfsByLorebookId(entryId);
      if (match) return `${match.item.name} (Lorebook)`;
      return "Lorebook Entry";
    }

    return id;
  }

  private findBlankItems(): string[] {
    const blanks: string[] = [];

    // 1. Check Structured Fields
    for (const config of FIELD_CONFIGS) {
      if (config.id === FieldID.Brainstorm) continue;

      const isList = config.layout === "list";
      let hasContent = false;

      if (isList) {
        const list = this.storyManager.getDulfsList(config.id);
        hasContent = list.length > 0;
      } else {
        const content = this.storyManager.getFieldContent(config.id);
        hasContent = !!(content && content.trim().length > 0);
      }

      // Check if currently active (to avoid double queueing even if not tracked by currentSegaId)
      let isActive = false;
      if (isList) {
        const state = this.agentWorkflow.getListGenerationState(config.id);
        isActive = state.isRunning || state.isQueued || false;
      } else {
        const session = this.agentWorkflow.getSession(config.id);
        isActive = session?.isRunning || session?.isQueued || false;
      }

      if (!hasContent && !isActive) {
        blanks.push(config.id);
      }
    }

    // 2. Check Linked Lorebooks
    const dulfsFields = FIELD_CONFIGS.filter((c) => c.layout === "list");
    for (const config of dulfsFields) {
      const list = this.storyManager.getDulfsList(config.id);
      for (const item of list) {
        if (item.linkedLorebooks && item.linkedLorebooks.length > 0) {
          for (const entryId of item.linkedLorebooks) {
            const id = `lorebook:${entryId}`;

            const content = this.storyManager.getFieldContent(id);
            const hasContent = !!(content && content.trim().length > 0);

            const session = this.agentWorkflow.getSession(id);
            const isActive = session?.isRunning || session?.isQueued || false;

            if (!hasContent && !isActive) {
              // Avoid duplicates
              if (!blanks.includes(id)) {
                blanks.push(id);
              }
            }
          }
        }
      }
    }

    return blanks;
  }
}
