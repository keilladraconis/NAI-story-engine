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
              style: {
                "font-weight": "bold",
                "font-size": "18px",
                "margin-bottom": "16px",
                color: "#1976d2",
              },
            }),

            // Workflow Progress Indicator
            this.createWorkflowProgress(),

            // Quick Actions
            this.createQuickActions(),

            // Structured Editor with Collapsible Sections
            this.structuredEditor.sidebar,

            // Workflow Footer
            this.createWorkflowFooter(),
          ],
        }),
      ],
    });
  }

  private createWorkflowProgress(): UIPart {
    const stages = [
      { id: "storyPrompt", label: "Prompt", icon: "edit" },
      { id: "brainstorm", label: "Brainstorm", icon: "lightning" },
      { id: "synopsis", label: "Synopsis", icon: "file-text" },
      { id: "dulfs", label: "DULFS", icon: "layers" },
    ];

    return part.row({
      content: stages.map((stage, index) => {
        const isActive = this.workflowProgress >= index + 1;
        const isCompleted = this.workflowProgress > index + 1;

        return part.column({
          content: [
            part.button({
              text: stage.label,
              callback: () => this.navigateToStage(index),
              style: {
                "font-size": "10px",
                padding: "2px 4px",
                "margin-bottom": "4px",
                "background-color": "transparent",
                border: "none",
                color: isActive ? "#1976d2" : "#999",
                cursor: "pointer",
              },
            }),
            part.text({
              text: isCompleted ? "✓" : "●",
              style: {
                "font-size": "14px",
                "text-align": "center",
                color: isCompleted ? "#4caf50" : isActive ? "#1976d2" : "#ccc",
              },
            }),
          ],
          style: {
            "margin-right": "12px",
            flex: 1,
          },
        });
      }),
      style: {
        "margin-bottom": "16px",
        padding: "8px",
        "background-color": "#f8f9fa",
        "border-radius": "6px",
        border: "1px solid #e9ecef",
      },
    });
  }

  private createQuickActions(): UIPart {
    return part.row({
      content: [
        part.button({
          text: "Expand All",
          callback: () => this.expandAllSections(),
          style: {
            "font-size": "12px",
            padding: "4px 8px",
            "margin-right": "8px",
            "background-color": "#f8f9fa",
            border: "1px solid #dee2e6",
            "border-radius": "3px",
            color: "#495057",
          },
        }),
        part.button({
          text: "Collapse All",
          callback: () => this.collapseAllSections(),
          style: {
            "font-size": "12px",
            padding: "4px 8px",
            "background-color": "#f8f9fa",
            border: "1px solid #dee2e6",
            "border-radius": "3px",
            color: "#495057",
          },
        }),
        part.button({
          text: "Clear All",
          callback: () => this.clearAllFields(),
          style: {
            "font-size": "12px",
            padding: "4px 8px",
            "margin-left": "8px",
            "background-color": "#f8d7da",
            border: "1px solid #f5c6cb",
            "border-radius": "3px",
            color: "#721c24",
          },
        }),
      ],
      style: {
        "margin-bottom": "16px",
      },
    });
  }

  private createWorkflowFooter(): UIPart {
    return part.column({
      content: [
        part.row({
          content: [
            part.text({
              text: "Workflow Stage: ",
              style: {
                "font-size": "12px",
                color: "#666",
                "margin-right": "8px",
              },
            }),
            part.text({
              text:
                ["Prompt", "Brainstorm", "Synopsis", "DULFS"][
                  this.workflowProgress - 1
                ] || "Complete",
              style: {
                "font-size": "12px",
                "font-weight": "bold",
                color: "#1976d2",
              },
            }),
          ],
          style: {
            "margin-bottom": "8px",
          },
        }),
        part.text({
          text: "💡 Tip: Expand sections to see your story develop across all stages",
          style: {
            "font-size": "11px",
            color: "#6c757d",
            "font-style": "italic",
          },
        }),
      ],
      style: {
        "margin-top": "16px",
        "padding-top": "16px",
        border: "1px solid #e9ecef",
        "border-radius": "4px",
        "background-color": "#f8f9fa",
      },
    });
  }

  // Navigation Methods
  private navigateToStage(stageIndex: number): void {
    this.workflowProgress = stageIndex + 1;
    // Expand the target stage
    const stageId = ["storyPrompt", "brainstorm", "synopsis", "dulfs"][
      stageIndex
    ];
    if (stageId) {
      this.structuredEditor.expandField(stageId);
    }
    // Update the UI
    this.sidebar = this.createSidebar();
  }

  // Quick Action Methods
  private expandAllSections(): void {
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
    fieldIds.forEach((fieldId) => this.structuredEditor.expandField(fieldId));
    this.sidebar = this.createSidebar();
  }

  private collapseAllSections(): void {
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
    fieldIds.forEach((fieldId) => this.structuredEditor.collapseField(fieldId));
    this.sidebar = this.createSidebar();
  }

  private clearAllFields(): void {
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
    fieldIds.forEach((fieldId) =>
      this.structuredEditor.setFieldContent(fieldId, ""),
    );
    this.sidebar = this.createSidebar();
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
