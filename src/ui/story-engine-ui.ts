// Story Engine UI Integration
import { StructuredEditor } from "./structured-editor";
import { StoryManager } from "../core/story-manager";
import { AgentCycleManager } from "../core/agent-cycle";
import { AgentWorkflowService } from "../core/agent-workflow";
import { BrainstormUI } from "./brainstorm-ui";
import { FieldID } from "../config/field-definitions";

import {
  createHeaderWithToggle,
  createToggleableContent,
} from "./ui-components";

const { part, extension } = api.v1.ui;
export class StoryEngineUI {
  private static readonly KEYS = {
    SIDEBAR_ID: "kse-sidebar",
    LOREBOOK_PANEL_ID: "kse-lorebook-panel",
    FIELD_STATES: "kse-field-states",
  };

  sidebar: UIExtensionSidebarPanel;
  lorebookPanel: UIExtensionLorebookPanel;
  structuredEditor: StructuredEditor;
  storyManager: StoryManager;
  agentCycleManager: AgentCycleManager;
  agentWorkflowService: AgentWorkflowService;
  brainstormUI: BrainstormUI;

  // Selected state
  private selectedLorebookEntryId?: string;
  private selectedLorebookCategoryId?: string;
  private lorebookEditMode: boolean = false;

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
    this.brainstormUI = new BrainstormUI(this.storyManager);
    this.sidebar = this.createSidebar();
    this.lorebookPanel = this.createLorebookPanel();

    // Subscribe to backend changes
    this.storyManager.subscribe(() => {
      this.updateUI();
      this.updateLorebookUI();
    });

    // Handle lorebook selection hook
    api.v1.hooks.register("onLorebookEntrySelected", (params) => {
      this.selectedLorebookEntryId = params.entryId;
      this.selectedLorebookCategoryId = params.categoryId;
      this.lorebookEditMode = false; // Reset to preview on selection
      this.updateLorebookUI();
    });
  }

  public async init(): Promise<void> {
    await this.storyManager.initializeStory();
    this.updateUI();
    this.updateLorebookUI();
  }

  private updateUI(): void {
    // Re-create the sidebar structure with new data
    this.structuredEditor.sidebar = this.structuredEditor.createSidebar();
    this.sidebar = this.createSidebar();

    api.v1.ui.update([
      this.sidebar as UIExtensionSidebarPanel & { id: string },
    ]);
  }

  private updateLorebookUI(): void {
    this.lorebookPanel = this.createLorebookPanel();
    api.v1.ui.update([
      this.lorebookPanel as UIExtensionLorebookPanel & { id: string },
    ]);
  }

  private createLorebookPanel(): UIExtensionLorebookPanel {
    const entryId = this.selectedLorebookEntryId;
    const categoryId = this.selectedLorebookCategoryId;

    let panelContent: UIPart[] = [];

    if (entryId) {
      // Find matching DULFS item
      const dulfsMatch = this.storyManager.findDulfsByLorebookId(entryId);

      if (dulfsMatch) {
        const { fieldId, item } = dulfsMatch;
        const sessionId = `lorebook:${entryId}`;

        let session = this.agentCycleManager.getSession(sessionId);
        if (!session) {
          session = this.agentCycleManager.startSession(sessionId);
          // Initialize with current lorebook text if possible
          api.v1.lorebook.entry(entryId).then((entry) => {
            if (entry && entry.text && session) {
              session.cycles.generate.content = entry.text;
              session.cycles.generate.status = "completed";
              this.updateLorebookUI();
            }
          });
        }

        const activeStage = session.selectedStage;

        panelContent = [
          part.column({
            style: { padding: "8px", gap: "12px" },
            content: [
              part.column({
                content: [
                  part.text({
                    text: `Source: ${item.name}`,
                    style: { "font-weight": "bold", opacity: "0.8" },
                  }),
                  part.text({
                    text: item.content,
                    style: { "font-style": "italic", "font-size": "0.9em" },
                  }),
                ],
                style: { "margin-bottom": "8px" },
              }),

              createHeaderWithToggle(
                "Entry content and agentic refinement",
                this.lorebookEditMode,
                () => {
                  this.lorebookEditMode = !this.lorebookEditMode;
                  this.updateLorebookUI();
                },
              ),

              createToggleableContent(
                this.lorebookEditMode,
                this.storyManager.getFieldContent(sessionId),
                "Lorebook text will appear here...",
                `story:kse-field-${sessionId}`, // Using the colon format for storage key too
                (val) => {
                  if (session) {
                    // Update active stage content to keep in sync
                    if (session.cycles[activeStage]) {
                      session.cycles[activeStage].content = val;
                    }
                    // Live save to StoryManager
                    this.storyManager.setFieldContent(sessionId, val, false);
                  }
                },
                { "min-height": "300px" },
              ),

              // Wand UI
              this.structuredEditor.getWandUI().createInlineControlCluster(
                session,
                sessionId,
                async (s) => {
                  // Save to Lorebook
                  const content = s.cycles[s.selectedStage].content;
                  await api.v1.lorebook.updateEntry(entryId, { text: content });
                  // Also update local store
                  this.storyManager.updateDulfsItem(
                    fieldId,
                    item.id,
                    { lorebookContent: content },
                    true,
                  );
                  api.v1.ui.toast("Lorebook entry updated");
                  this.updateLorebookUI();
                },
                (s) => {
                  // Discard
                  s.cycles[s.selectedStage].content = "";
                  this.updateLorebookUI();
                },
                () => this.updateLorebookUI(),
              ),
            ],
          }),
        ];
      } else {
        panelContent = [
          part.column({
            style: { padding: "16px", "text-align": "center", opacity: "0.6" },
            content: [
              part.text({ text: "This entry is not managed by Story Engine." }),
            ],
          }),
        ];
      }
    } else if (categoryId) {
      panelContent = [
        part.column({
          style: { padding: "16px", "text-align": "center", opacity: "0.6" },
          content: [
            part.text({
              text: "Select an entry to use the Story Engine Wand.",
            }),
          ],
        }),
      ];
    } else {
      panelContent = [
        part.column({
          style: { padding: "16px", "text-align": "center", opacity: "0.6" },
          content: [
            part.text({ text: "Select an entry in the Lorebook to begin." }),
          ],
        }),
      ];
    }

    return extension.lorebookPanel({
      id: StoryEngineUI.KEYS.LOREBOOK_PANEL_ID,
      name: "Story Engine",
      iconId: "zap",
      content: panelContent,
    });
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
              ],
            }),

            // Structured Editor with Collapsible Sections
            this.structuredEditor.sidebar,
          ],
        }),
      ],
    });
  }

  public exportStoryData(): any {
    const data: Record<string, any> = {
      fieldContents: {},
      timestamps: new Date().toISOString(),
    };

    // Export all field contents
    Object.values(FieldID).forEach((fieldId) => {
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
