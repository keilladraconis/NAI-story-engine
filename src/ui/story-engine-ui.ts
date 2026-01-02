// Story Engine UI Integration
import { StructuredEditor } from "./structured-editor";

const { part, extension } = api.v1.ui;
export class StoryEngineUI {
  private static readonly KEYS = {
    SIDEBAR_ID: "kse-sidebar",
    FIELD_STATES: "kse-field-states",
  };

  sidebar: UIExtensionSidebarPanel;
  structuredEditor: StructuredEditor;
  private workflowProgress: number = 1; // Current workflow stage

  constructor() {
    this.structuredEditor = new StructuredEditor();
    this.sidebar = this.createSidebar();
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
            part.text({
              text: "🎭 Story Engine",
            }),

            // Structured Editor with Collapsible Sections
            this.structuredEditor.sidebar,

            // Workflow Footer
            this.createWorkflowFooter(),
          ],
        }),
      ],
    });
  }

  private createWorkflowFooter(): UIPart {
    return part.column({
      content: [
        part.row({
          content: [
            part.text({
              text: "Workflow Stage: ",
            }),
            part.text({
              text:
                ["Prompt", "Brainstorm", "Synopsis", "DULFS"][
                  this.workflowProgress - 1
                ] || "Complete",
            }),
          ],
        }),
        part.text({
          text: "💡 Tip: Expand sections to see your story develop across all stages",
        }),
      ],
    });
  }

  // Public API for external access
  public getCurrentStage(): number {
    return this.workflowProgress;
  }

  public setWorkflowStage(stage: number): void {
    this.workflowProgress = Math.max(1, Math.min(4, stage));
    this.sidebar = this.createSidebar();
  }

  public exportStoryData(): any {
    const data: Record<string, any> = {
      workflowStage: this.workflowProgress,
      fieldContents: {},
      timestamps: new Date().toISOString(),
    };

    // Export all field contents
    const fieldIds = [
      "storyPrompt",
      "brainstorm",
      "synopsis",
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

    // Import workflow stage
    if (data.workflowStage && typeof data.workflowStage === "number") {
      this.setWorkflowStage(data.workflowStage);
    }

    this.sidebar = this.createSidebar();
  }
}
