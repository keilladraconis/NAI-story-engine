import { StoryManager } from "../core/story-manager";
import { AgentCycleManager, FieldSession } from "../core/agent-cycle";
import { AgentWorkflowService } from "../core/agent-workflow";
import { FIELD_CONFIGS, FieldConfig, FieldID } from "../config/field-definitions";
import { createHeaderWithToggle, createToggleableContent } from "./ui-components";
import { WandUI } from "./wand-ui";

const { column, row, button, collapsibleSection } = api.v1.ui.part;

export class StructuredEditor {
  private configs: Map<FieldID, FieldConfig> = new Map();
  sidebar: UIPart;
  private storyManager: StoryManager;
  private agentCycleManager: AgentCycleManager;
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
    this.onUpdateCallback = onUpdateCallback;
    this.wandUI = new WandUI(agentCycleManager, agentWorkflowService, onUpdateCallback);

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

  private async syncFieldsFromStorage(): Promise<void> {
    let anyChanged = false;
    for (const config of this.configs.values()) {
      // We use the storage key directly from storyStorage
      const savedContent = await api.v1.storyStorage.get(
        `kse-field-${config.id}`,
      );
      if (savedContent && typeof savedContent === "string") {
        await this.storyManager.setFieldContent(config.id, savedContent, false);
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
    const session = this.agentCycleManager.getSession(config.id);

    // If there is an active session (Wand Mode), render the workflow UI inline
    if (session) {
      const wandEditKey = `wand-${config.id}`;
      const isWandEditMode = this.editModes.get(wandEditKey) || false;

      return collapsibleSection({
        title: `${config.label} (Wand Active)`,
        iconId: config.icon,
        storageKey: `story:kse-section-${config.id}`,
        content: this.wandUI.createWorkflowUI(
          session,
          config.id,
          isWandEditMode,
          () => this.toggleEditMode(wandEditKey),
          (s) => this.saveWandResult(s)
        ),
      });
    }

    // Standard View
    const content = this.storyManager.getFieldContent(config.id);
    const isEditMode = this.editModes.get(config.id) || false;

    return collapsibleSection({
      title: config.label,
      iconId: config.icon,
      storageKey: `story:kse-section-${config.id}`,
      content: [
        // Field header with description and toggle
        createHeaderWithToggle(config.description, isEditMode, () =>
          this.toggleEditMode(config.id)
        ),

        // Text input area or Markdown view
        createToggleableContent(
          isEditMode,
          content,
          config.placeholder,
          `story:kse-field-${config.id}`,
          (newContent: string) => this.handleFieldChange(config.id, newContent)
        ),

        // Action buttons (Generate, etc.)
        this.createFieldActions(config),
      ],
    });
  }

  private createFieldActions(config: FieldConfig): UIPart {
    const buttons: any[] = []; // using any to avoid strict UIPart type issues if not imported

    // Wand Button (Primary fields only)
    const isPrimaryField = [FieldID.WorldSnapshot].includes(config.id);
    if (isPrimaryField) {
      buttons.push(
        button({
          text: "🪄 Wand",
          callback: () => this.handleWandClick(config.id),
        }),
      );
    }

    if (buttons.length === 0) return row({ content: [] });

    return row({
      content: buttons,
      style: { gap: "8px", "margin-top": "8px" },
    });
  }

  private handleWandClick(fieldId: string): void {
    const config = this.configs.get(fieldId as FieldID);
    if (!config) return;

    // Start a new session
    this.agentCycleManager.startSession(
      config.id,
      this.storyManager.getFieldContent(config.id),
    );
    
    // Trigger UI update to switch to Wand Mode
    this.onUpdateCallback();
  }

  private async saveWandResult(session: FieldSession): Promise<void> {
    if (!session.currentContent) {
      api.v1.ui.toast("No content to save.", { type: "warning" });
      return;
    }

    // 1. Update the specific storage key bound to the UI input FIRST
    await api.v1.storyStorage.set(
      `kse-field-${session.fieldId}`,
      session.currentContent,
    );

    // 2. Update the Manager (Source of Truth) silently
    await this.storyManager.setFieldContent(
      session.fieldId,
      session.currentContent,
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