import { StoryManager } from "../core/story-manager";
import { AgentCycleManager, FieldSession } from "../core/agent-cycle";
import { AgentWorkflowService } from "../core/agent-workflow";
import { FIELD_CONFIGS, FieldConfig, FieldID } from "../config/field-definitions";
import { WandUI } from "./wand-ui";
import { getFieldStrategy, RenderContext } from "./field-strategies";

const { column, collapsibleSection } = api.v1.ui.part;

export class StructuredEditor {
  private configs: Map<FieldID, FieldConfig> = new Map();
  sidebar: UIPart;
  private storyManager: StoryManager;
  private agentCycleManager: AgentCycleManager;
  private agentWorkflowService: AgentWorkflowService;
  private onUpdateCallback: () => void;
  private editModes: Map<string, boolean> = new Map();
  private wandUI: WandUI;

  constructor(
    storyManager: StoryManager,
    agentCycleManager: AgentCycleManager,
    agentWorkflowService: AgentWorkflowService,
    onUpdateCallback: () => void = () => {},
  ) {
    this.storyManager = storyManager;
    this.agentCycleManager = agentCycleManager;
    this.agentWorkflowService = agentWorkflowService;
    this.onUpdateCallback = onUpdateCallback;
    this.wandUI = new WandUI(agentWorkflowService, onUpdateCallback);

    this.initializeFieldConfigs();
    this.sidebar = this.createSidebar();

    this.syncFieldsFromStorage().then(() => {
      // If sync changed anything, it would have triggered a save & notify
      // which StoryEngineUI listens to.
    });
  }

  private toggleEditMode(fieldId: string): void {
    const current = this.editModes.get(fieldId) || false;
    this.editModes.set(fieldId, !current);
    this.onUpdateCallback();
  }

  private getItemEditMode(fieldId: string, itemId: string): boolean {
    return this.editModes.get(`${fieldId}-${itemId}`) || false;
  }

  private toggleItemEditMode(fieldId: string, itemId: string): void {
    const key = `${fieldId}-${itemId}`;
    const current = this.editModes.get(key) || false;
    this.editModes.set(key, !current);
    this.onUpdateCallback();
  }

  private async syncFieldsFromStorage(): Promise<void> {
    let anyChanged = false;
    for (const config of this.configs.values()) {
      // For lists, we don't sync from simple strings yet. 
      // The StoryManager handles the source of truth for lists.
      // So we skip list fields for this simple sync check or handle them differently if needed.
      if (config.layout === 'list') continue;

      // We use the storage key directly from storyStorage
      const savedContent = await api.v1.storyStorage.get(
        `kse-field-${config.id}`,
      );
      if (savedContent && typeof savedContent === "string") {
        await this.storyManager.setFieldContent(config.id, savedContent, false);

        // Also sync any active session (e.g. WorldSnapshot)
        const session = this.agentCycleManager.getSession(config.id);
        if (session) {
          const activeStage = session.selectedStage;
          if (session.cycles[activeStage]) {
            session.cycles[activeStage].content = savedContent;
          }
        }

        anyChanged = true;
      }
    }

    if (anyChanged) {
      await this.storyManager.saveStoryData(true);
    }
  }

  private initializeFieldConfigs(): void {
    FIELD_CONFIGS.forEach((config) => {
      this.configs.set(config.id, config);
    });
  }

  public createSidebar(): UIPart {
    return column({
      content: [
        // Collapsible sections for all fields
        column({
          content: Array.from(this.configs.values())
            .map((config) =>
            this.createFieldSection(config),
          ),
          style: {
            gap: "8px",
            "margin-top": "16px",
          },
        }),
      ],
    });
  }

  private createFieldSection(config: FieldConfig): UIPart {
    // Determine edit mode state key
    // Logic from previous implementation:
    // Standard/Snapshot/Prompt: `config.id`
    // Generic Wand (Legacy): `wand-${config.id}` (Removed)
    
    // We can infer the key based on whether we have a session AND NOT Inline Wand
    const editModeKey: string = config.id;

    const context: RenderContext = {
      config,
      storyManager: this.storyManager,
      agentCycleManager: this.agentCycleManager,
      wandUI: this.wandUI,
      editModeState: this.editModes.get(editModeKey) || false,
      toggleEditMode: () => this.toggleEditMode(editModeKey),
      handleFieldChange: (c) => this.handleFieldChange(config.id, c),
      handleWandClick: () => this.handleWandClick(config.id),
      saveWandResult: (s) => this.saveWandResult(s),
      // List specific
      getItemEditMode: (itemId) => this.getItemEditMode(config.id, itemId),
      toggleItemEditMode: (itemId) => this.toggleItemEditMode(config.id, itemId),
      runListGeneration: () => this.agentWorkflowService.runListGeneration(config.id, this.onUpdateCallback),
    };

    const strategy = getFieldStrategy(config);

    return collapsibleSection({
      title: strategy.getTitle(context),
      iconId: config.icon,
      storageKey: `story:kse-section-${config.id}`,
      content: strategy.renderContent(context),
    });
  }

  private handleWandClick(fieldId: string): void {
    const config = this.configs.get(fieldId as FieldID);
    if (!config) return;

    // Start a new session
    this.agentCycleManager.startSession(
      config.id,
    );
    
    // Trigger UI update to switch to Wand Mode
    this.onUpdateCallback();
  }

  private async saveWandResult(session: FieldSession): Promise<void> {
    const content = session.cycles[session.selectedStage].content;
    if (!content) {
      api.v1.ui.toast("No content to save.", { type: "warning" });
      return;
    }

    // 1. Update the specific storage key bound to the UI input FIRST
    await api.v1.storyStorage.set(
      `kse-field-${session.fieldId}`,
      content,
    );

    // 2. Update the Manager (Source of Truth) silently
    await this.storyManager.setFieldContent(
      session.fieldId,
      content,
      false, // Do NOT notify yet
    );

    // 3. Commit to history
    await this.storyManager.commit();

    api.v1.ui.toast(`Saved generated content to ${session.fieldId}`, {
      type: "success",
    });
    
    // End session and revert UI
    this.agentCycleManager.endSession(session.fieldId);
    this.onUpdateCallback();
  }

  private handleFieldChange(fieldId: string, content: string): void {
    // Update StoryManager which will trigger UI updates via the listener in StoryEngineUI
    this.storyManager.setFieldContent(fieldId, content);
  }

  // Public methods for external access
  public getFieldContent(fieldId: string): string {
    return this.storyManager.getFieldContent(fieldId);
  }

  public setFieldContent(fieldId: string, content: string): void {
    this.storyManager.setFieldContent(fieldId, content);
  }
}