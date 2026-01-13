import { StoryManager } from "./story-manager";
import { AgentWorkflowService } from "./agent-workflow";
import { FIELD_CONFIGS, FieldID } from "../config/field-definitions";
import { Subscribable } from "./subscribable";

export class SegaService extends Subscribable<void> {
  private _isRunning: boolean = false;
  private currentSegaId?: string;
  private bootstrapIds: Set<string> = new Set();

  constructor(
    private storyManager: StoryManager,
    private agentWorkflow: AgentWorkflowService,
  ) {
    super();
    // Subscribe to workflow updates to track completion
    this.agentWorkflow.subscribe((fieldId) => this.onWorkflowUpdate(fieldId));
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

    // Fast S.E.G.A. check: if Story Prompt, ATTG and Style are empty and unbound, offer to bootstrap
    if (this.shouldTriggerFastSega()) {
      this.showFastSegaModal();
      return;
    }

    this._startNormal();
  }

  private _startNormal() {
    this._isRunning = true;
    api.v1.ui.toast("S.E.G.A. Background Generation Started");
    this.tryNext();
    this.notify();
  }

  private shouldTriggerFastSega(): boolean {
    const prompt = this.storyManager.getFieldContent(FieldID.StoryPrompt);
    const attg = this.storyManager.getFieldContent(FieldID.ATTG);
    const style = this.storyManager.getFieldContent(FieldID.Style);

    const promptUnbound = !this.storyManager.isTextFieldLorebookEnabled(
      FieldID.StoryPrompt,
    );
    const attgUnbound = !this.storyManager.isAttgEnabled();
    const styleUnbound = !this.storyManager.isStyleEnabled();

    const isEmpty = (s: string) => !s || s.trim().length === 0;

    return (
      isEmpty(prompt) &&
      promptUnbound &&
      isEmpty(attg) &&
      attgUnbound &&
      isEmpty(style) &&
      styleUnbound
    );
  }

  private async showFastSegaModal() {
    const modal = await api.v1.ui.modal.open({
      title: "Bootstrap Story from Brainstorm?",
      size: "small",
      content: [
        {
          type: "text",
          text: "Story Prompt, ATTG, and Style Guidelines are empty. Would you like to queue their generation and bind them to Lorebook, Memory, and Author's Note so you can immediately start writing?",
        },
        {
          type: "row",
          spacing: "end",
          style: { marginTop: "15px" },
          content: [
            {
              type: "button",
              text: "Yes!",
              callback: async () => {
                await modal.close();
                await this.bootstrapFastSega();
              },
            },
            {
              type: "button",
              text: "No",
              style: { marginLeft: "10px" },
              callback: async () => {
                await modal.close();
                // If no, we just don't start SEGA as per user request
                this.notify();
              },
            },
          ],
        },
      ],
    });
  }

  private async bootstrapFastSega() {
    // 1. Bind fields
    await this.storyManager.setTextFieldLorebookEnabled(
      FieldID.StoryPrompt,
      true,
    );
    await this.storyManager.setAttgEnabled(true);
    await this.storyManager.setStyleEnabled(true);

    // 2. Queue generations
    // Note: They will be queued sequentially by AgentWorkflowService
    this.bootstrapIds.add(FieldID.StoryPrompt);
    this.bootstrapIds.add(FieldID.ATTG);
    this.bootstrapIds.add(FieldID.Style);

    this.agentWorkflow.requestFieldGeneration(FieldID.StoryPrompt, () => {});
    this.agentWorkflow.requestFieldGeneration(FieldID.ATTG, () => {});
    this.agentWorkflow.requestFieldGeneration(FieldID.Style, () => {});

    // 3. Start SEGA in normal mode
    this._isRunning = true;
    api.v1.ui.toast("Bootstrap started. S.E.G.A. active.");

    // Trigger the next random item (it will be queued after the above three)
    this.tryNext();

    this.notify();
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

    this.bootstrapIds.clear();

    this.notify();
  }

  private onWorkflowUpdate(fieldId: string) {
    if (!this._isRunning) return;

    const isCurrentSega = fieldId === this.currentSegaId;
    const isBootstrap = this.bootstrapIds.has(fieldId);

    // We only care if the updated field is managed by SEGA
    if (!isCurrentSega && !isBootstrap) return;

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
      if (isBootstrap) {
        this.bootstrapIds.delete(fieldId);
      }

      if (isCurrentSega) {
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
      this.notify();
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
