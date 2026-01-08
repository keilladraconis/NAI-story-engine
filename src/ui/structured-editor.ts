import { StoryManager } from "../core/story-manager";
import { AgentWorkflowService } from "../core/agent-workflow";
import { FIELD_CONFIGS, FieldConfig, FieldID } from "../config/field-definitions";
import { getFieldStrategy, RenderContext } from "./field-strategies";

const { column, collapsibleSection } = api.v1.ui.part;

export class StructuredEditor {
  private configs: Map<FieldID, FieldConfig> = new Map();
  sidebar: UIPart;
  private storyManager: StoryManager;
  private agentWorkflowService: AgentWorkflowService;
  private onUpdateCallback: () => void;
  private editModes: Map<string, boolean> = new Map();

  constructor(
    storyManager: StoryManager,
    agentWorkflowService: AgentWorkflowService,
    onUpdateCallback: () => void = () => {},
  ) {
    this.storyManager = storyManager;
    this.agentWorkflowService = agentWorkflowService;
    this.onUpdateCallback = onUpdateCallback;

    this.initializeFieldConfigs();
    this.sidebar = this.createSidebar();
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
            .filter((config) => !config.hidden)
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
    // Generic Generation (Legacy): `gen-${config.id}` (Removed)
    
    // We can infer the key based on whether we have a session AND NOT Inline Generation
    const editModeKey: string = config.id;

    const context: RenderContext = {
      config,
      storyManager: this.storyManager,
      agentWorkflowService: this.agentWorkflowService,
      editModeState: this.editModes.get(editModeKey) || false,
      toggleEditMode: () => this.toggleEditMode(editModeKey),
      handleFieldChange: (c) => this.handleFieldChange(config.id, c),
      // List specific
      getItemEditMode: (itemId) => this.getItemEditMode(config.id, itemId),
      toggleItemEditMode: (itemId) => this.toggleItemEditMode(config.id, itemId),
      runListGeneration: () => this.agentWorkflowService.runListGeneration(config.id, this.onUpdateCallback),
      getListGenerationState: () => this.agentWorkflowService.getListGenerationState(config.id),
      cancelListGeneration: () => this.agentWorkflowService.cancelListGeneration(config.id),
      // Generator Sync
      setAttgEnabled: (enabled) => this.storyManager.setAttgEnabled(enabled),
      isAttgEnabled: () => this.storyManager.isAttgEnabled(),
      setStyleEnabled: (enabled) => this.storyManager.setStyleEnabled(enabled),
      isStyleEnabled: () => this.storyManager.isStyleEnabled(),
      runFieldGeneration: (fieldId) => this.agentWorkflowService.runFieldGeneration(fieldId, this.onUpdateCallback),
    };

    const strategy = getFieldStrategy(config);

    return collapsibleSection({
      title: strategy.getTitle(context),
      iconId: config.icon,
      storageKey: `story:kse-section-${config.id}`,
      content: strategy.renderContent(context),
    });
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