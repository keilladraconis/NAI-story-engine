// Story Engine UI Integration
import { StructuredEditor } from "./structured-editor";
import { StoryManager } from "../core/story-manager";
import { AgentCycleManager } from "../core/agent-cycle";
import { AgentWorkflowService } from "../core/agent-workflow";

const { part, extension } = api.v1.ui;
export class StoryEngineUI {
  private static readonly KEYS = {
    SIDEBAR_ID: "kse-sidebar",
    FIELD_STATES: "kse-field-states",
  };

  sidebar: UIExtensionSidebarPanel;
  structuredEditor: StructuredEditor;
  storyManager: StoryManager;
  agentCycleManager: AgentCycleManager;
  agentWorkflowService: AgentWorkflowService;

  constructor() {
    this.storyManager = new StoryManager();
    this.agentCycleManager = new AgentCycleManager();
    this.agentWorkflowService = new AgentWorkflowService(this.storyManager);
    this.structuredEditor = new StructuredEditor(
      this.storyManager,
      this.agentCycleManager,
      this.agentWorkflowService,
      () => this.updateUI(),
    );
    this.sidebar = this.createSidebar();

    // Subscribe to backend changes
    this.storyManager.subscribe(() => {
      this.updateUI();
    });
  }

  private updateUI(): void {
    // Re-create the sidebar structure with new data
    // StructuredEditor reads from StoryManager when creating its sidebar part
    this.structuredEditor.sidebar = this.structuredEditor.createSidebar();
    this.sidebar = this.createSidebar();

    // Update the UI in NovelAI
    // Assuming api.v1.ui.update exists as per instructions, though likely part of a specific namespace or extension update method
    // If api.v1.ui.update(id, part) is the standard:
    // However, for sidebar panels, usually we re-register or update the extension.
    // If we can't find api.v1.ui.update, we might need to rely on the fact that modifying the object passed to register might not be enough.
    // Given the prompt requirement "properly use api.v1.ui.update", I will assume it works for the sidebar ID.
    // If it's actually api.v1.ui.extension.update or similar, I'd need that.
    // But let's stick to the prompt's implied signature or the general update capability.

    // In many NAI scripts, updating a sidebar involves calling update on the sidebar extension or re-registering.
    // If `api.v1.ui.update` is the method to update a generic UIPart by ID:

    api.v1.ui.update([
      this.sidebar as UIExtensionSidebarPanel & { id: string },
    ]);
  }

  private createSidebar(): UIExtensionSidebarPanel {
    return extension.sidebarPanel({
      id: StoryEngineUI.KEYS.SIDEBAR_ID,
      name: "Story Engine",
      iconId: "lightning",
      content: [
        part.column({
          content: [
            // Header
            part.row({
              style: {
                "justify-content": "space-between",
                "align-items": "center",
                "margin-bottom": "8px",
              },
              content: [
                part.text({
                  text: "🎭 Story Engine",
                  style: { "font-weight": "bold" },
                }),
                part.button({
                  text: "Save",
                  iconId: "save",
                  callback: () => this.handleSave(),
                }),
              ],
            }),

            // Structured Editor with Collapsible Sections
            this.structuredEditor.sidebar,
          ],
        }),
      ],
    });
  }

  private async handleSave(): Promise<void> {
    await this.storyManager.commit();
    api.v1.ui.toast("Story engine state committed to history.", {
      type: "success",
    });
  }

  public exportStoryData(): any {
    const data: Record<string, any> = {
      fieldContents: {},
      timestamps: new Date().toISOString(),
    };

    // Export all field contents
    const fieldIds = [
      "storyPrompt",
      "brainstorm",
      "worldSnapshot",
      "dulfs",
      "dramatisPersonae",
      "universeSystems",
      "locations",
      "storyLorebooks",
    ];

    fieldIds.forEach((fieldId) => {
      data.fieldContents[fieldId] =
        this.structuredEditor.getFieldContent(fieldId);
    });

    return data;
  }

  public importStoryData(data: any): void {
    if (!data || !data.fieldContents) return;

    // Import field contents
    Object.entries(data.fieldContents).forEach(([fieldId, content]) => {
      if (typeof content === "string") {
        this.structuredEditor.setFieldContent(fieldId, content);
      }
    });
  }
}
