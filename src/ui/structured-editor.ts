import { StoryManager } from "../core/story-manager";
import { AgentWorkflowService } from "../core/agent-workflow";
import {
  FIELD_CONFIGS,
  FieldConfig,
  FieldID,
} from "../config/field-definitions";
import { getFieldStrategy, RenderContext } from "./field-strategies";
import { Subscribable } from "../core/subscribable";

const { column, collapsibleSection } = api.v1.ui.part;

export class StructuredEditor extends Subscribable<void> {
  private configs: Map<FieldID, FieldConfig> = new Map();
  sidebar: UIPart;
  private storyManager: StoryManager;
  private agentWorkflowService: AgentWorkflowService;
  private editModes: Map<string, boolean> = new Map();
  private drafts: Map<string, string> = new Map();

  constructor(
    storyManager: StoryManager,
    agentWorkflowService: AgentWorkflowService,
  ) {
    super();
    this.storyManager = storyManager;
    this.agentWorkflowService = agentWorkflowService;

    this.initializeFieldConfigs();
    this.sidebar = this.createSidebar();
  }

  private toggleEditMode(fieldId: string): void {
    const isEditing = this.editModes.get(fieldId) || false;

    if (isEditing) {
      // Switching from Edit to Preview -> SAVE
      // Check if we have a draft for this field
      if (this.drafts.has(fieldId)) {
        const draft = this.drafts.get(fieldId);
        // Only save if draft is defined
        if (draft !== undefined) {
          this.storyManager.setFieldContent(fieldId, draft);
        }
        // Clear draft after saving
        this.drafts.delete(fieldId);
      }
    } else {
      // Switching from Preview to Edit -> Initialize Draft
      const content = this.storyManager.getFieldContent(fieldId);
      this.drafts.set(fieldId, content);
    }

    this.editModes.set(fieldId, !isEditing);
    this.notify();
  }

  private getItemEditMode(fieldId: string, itemId: string): boolean {
    return this.editModes.get(`${fieldId}-${itemId}`) || false;
  }

  private toggleItemEditMode(fieldId: string, itemId: string): void {
    const key = `${fieldId}-${itemId}`;
    const current = this.editModes.get(key) || false;
    this.editModes.set(key, !current);
    this.notify();
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
            .map((config) => this.createFieldSection(config)),
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
    const isEditing = this.editModes.get(editModeKey) || false;

    const context: RenderContext = {
      config,
      storyManager: this.storyManager,
      agentWorkflowService: this.agentWorkflowService,
      editModeState: isEditing,
      toggleEditMode: () => this.toggleEditMode(editModeKey),
      handleFieldChange: (c) => this.handleFieldChange(config.id, c),
      currentContent: isEditing ? this.drafts.get(config.id) : undefined,
      // List specific
      getItemEditMode: (itemId) => this.getItemEditMode(config.id, itemId),
      toggleItemEditMode: (itemId) =>
        this.toggleItemEditMode(config.id, itemId),
      runListGeneration: () =>
        this.agentWorkflowService.requestListGeneration(config.id),
      getListGenerationState: () =>
        this.agentWorkflowService.getListGenerationState(config.id),
      cancelListGeneration: () =>
        this.agentWorkflowService.cancelListGeneration(config.id),
      runDulfsItemGeneration: (itemId) =>
        this.agentWorkflowService.requestDulfsContentGeneration(
          config.id,
          itemId,
        ),
      getItemGenerationState: (itemId) => {
        // We use {fieldId}:{itemId} as the session key for item generation
        const sessionKey = `${config.id}:${itemId}`;
        return this.agentWorkflowService.getSession(sessionKey);
      },
      // Generator Sync
      setAttgEnabled: (enabled) => this.storyManager.setAttgEnabled(enabled),
      isAttgEnabled: () => this.storyManager.isAttgEnabled(),
      setStyleEnabled: (enabled) => this.storyManager.setStyleEnabled(enabled),
      isStyleEnabled: () => this.storyManager.isStyleEnabled(),
      setIsTextFieldLorebookEnabled: async (enabled) =>
        this.storyManager.setTextFieldLorebookEnabled(config.id, enabled),
      isTextFieldLorebookEnabled: () =>
        this.storyManager.isTextFieldLorebookEnabled(config.id),
      runFieldGeneration: (fieldId) =>
        this.agentWorkflowService.requestFieldGeneration(fieldId),
      cancelFieldGeneration: (fieldId) =>
        this.agentWorkflowService.cancelFieldGeneration(fieldId),
      
      // Summary
      runSummaryGeneration: () =>
        this.agentWorkflowService.requestDulfsSummaryGeneration(config.id),
      cancelSummaryGeneration: () =>
        this.agentWorkflowService.cancelFieldGeneration(`summary:${config.id}`),
      getSummaryGenerationState: () =>
        this.agentWorkflowService.getSession(`summary:${config.id}`),
      
      // Summary Visibility
      getSummaryVisibility: () =>
        this.editModes.get(`summary-visible:${config.id}`) || false,
      toggleSummaryVisibility: () => {
        const key = `summary-visible:${config.id}`;
        const current = this.editModes.get(key) || false;
        this.editModes.set(key, !current);
        this.notify();
      },
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
    const isEditing = this.editModes.get(fieldId) || false;

    if (isEditing) {
      // Update draft
      this.drafts.set(fieldId, content);
    } else {
      // Update StoryManager directly (fallback or non-edit updates)
      this.storyManager.setFieldContent(fieldId, content);
    }
  }

  // Public methods for external access
  public getFieldContent(fieldId: string): string {
    return this.storyManager.getFieldContent(fieldId);
  }

  public setFieldContent(fieldId: string, content: string): void {
    this.storyManager.setFieldContent(fieldId, content);
  }
}
