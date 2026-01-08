// Story Engine UI Integration
import { StructuredEditor } from "./structured-editor";
import { StoryManager } from "../core/story-manager";
import { AgentWorkflowService } from "../core/agent-workflow";
import { BrainstormUI } from "./brainstorm-ui";

import {
  createHeaderWithToggle,
  createToggleableContent,
  createResponsiveGenerateButton,
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
  agentWorkflowService: AgentWorkflowService;
  brainstormUI: BrainstormUI;

  // Selected state
  private selectedLorebookEntryId?: string;
  private selectedLorebookCategoryId?: string;
  private lorebookEditMode: boolean = false;
  private showClearConfirm: boolean = false;

  constructor() {
    this.storyManager = new StoryManager();
    this.agentWorkflowService = new AgentWorkflowService(this.storyManager);
    this.structuredEditor = new StructuredEditor(
      this.storyManager,
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
    api.v1.hooks.register("onLorebookEntrySelected", async (params) => {
      this.selectedLorebookEntryId = params.entryId;
      this.selectedLorebookCategoryId = params.categoryId;
      this.lorebookEditMode = false; // Reset to preview on selection

      if (params.entryId) {
        await this.loadLorebookEntry(params.entryId);
      }

      this.updateLorebookUI();
    });
  }

  public async init(): Promise<void> {
    await this.storyManager.initializeStory();
    this.updateUI();
    this.updateLorebookUI();
  }

  private async loadLorebookEntry(entryId: string): Promise<void> {
    const dulfsMatch = this.storyManager.findDulfsByLorebookId(entryId);
    if (dulfsMatch) {
      const sessionId = `lorebook:${entryId}`;
      let session = this.agentWorkflowService.getSession(sessionId);
      if (!session) {
        this.agentWorkflowService.startSession(sessionId);
        // Initialize with current lorebook text if possible
        const entry = await api.v1.lorebook.entry(entryId);
        if (entry && entry.text) {
          await this.storyManager.setFieldContent(sessionId, entry.text, false);
        }
      }
    }
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
        const { item } = dulfsMatch;
        const sessionId = `lorebook:${entryId}`;

        const session = this.agentWorkflowService.getSession(sessionId);
        const isRunning = session?.isRunning || false;
        const isQueued = session?.isQueued || false;
        const budgetState = session?.budgetState;

        const genButton = createResponsiveGenerateButton(
          `gen-btn-${sessionId}`,
          {
            isRunning,
            isQueued,
            budgetState,
          },
          {
            onStart: () => {
              this.agentWorkflowService.requestFieldGeneration(sessionId, () => {
                this.updateLorebookUI();
                // Also sync to NovelAI Lorebook on completion or chunk
                const content = this.storyManager.getFieldContent(sessionId);
                api.v1.lorebook.updateEntry(entryId, { text: content });
              });
            },
            onCancel: () => {
              this.agentWorkflowService.cancelFieldGeneration(sessionId);
            },
            onContinue: () => {
              if (session?.budgetResolver) {
                session.budgetResolver();
              }
            },
          },
          "Generate",
        );

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
                genButton,
              ),

              createToggleableContent(
                this.lorebookEditMode,
                this.storyManager.getFieldContent(sessionId),
                "Lorebook text will appear here...",
                `input-field-${sessionId}`,
                (val) => {
                  this.storyManager.setFieldContent(sessionId, val, false);
                  // Sync to NovelAI Lorebook
                  api.v1.lorebook.updateEntry(entryId, { text: val });
                },
                { "min-height": "300px" },
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
                      text: "Select an entry to use the Story Engine Generator.",
                    }),
                  ],
                }),
              ];    } else {
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
    const headerContent: UIPart[] = [
      part.text({
        text: "🎭 Story Engine",
        style: { "font-weight": "bold" },
      }),
    ];

    if (this.showClearConfirm) {
      headerContent.push(
        part.row({
          style: { gap: "8px", "align-items": "center" },
          content: [
            part.text({
              text: "Clear All?",
              style: { color: "red", "font-weight": "bold", "font-size": "0.9em" },
            }),
            part.button({
              text: "Yes",
              style: {
                "background-color": "rgba(255, 0, 0, 0.1)",
                color: "red",
                padding: "2px 8px",
                "font-size": "0.8em",
              },
              callback: async () => {
                await this.storyManager.clearAllStoryData();
                this.showClearConfirm = false;
                this.updateUI();
              },
            }),
            part.button({
              text: "No",
              style: { padding: "2px 8px", "font-size": "0.8em" },
              callback: () => {
                this.showClearConfirm = false;
                this.updateUI();
              },
            }),
          ],
        }),
      );
    } else {
      headerContent.push(
        part.button({
          text: "Clear All",
          iconId: "trash-2",
          style: { padding: "4px 8px", "font-size": "0.8em", opacity: "0.7" },
          callback: () => {
            this.showClearConfirm = true;
            this.updateUI();
          },
        }),
      );
    }

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
              content: headerContent,
            }),

            // Structured Editor with Collapsible Sections
            this.structuredEditor.sidebar,
          ],
        }),
      ],
    });
  }
}
