import { StoryManager } from "../core/story-manager";
import { AgentCycleManager, FieldSession } from "../core/agent-cycle";
import { AgentWorkflowService } from "../core/agent-workflow";

const { column, row, text, button, multilineTextInput, collapsibleSection, checkboxInput } =
  api.v1.ui.part;

interface FieldConfig {
  id: string;
  label: string;
  description: string;
  placeholder: string;
  icon: IconId;

  linkedEntities?: string[];
}

export class StructuredEditor {
  private configs: Map<string, FieldConfig> = new Map();
  sidebar: UIPart;
  private storyManager: StoryManager;
  private agentCycleManager: AgentCycleManager;
  private agentWorkflowService: AgentWorkflowService;
  private onUpdateCallback: () => void;

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
    this.initializeFieldConfigs();
    this.sidebar = this.createSidebar();

    this.syncFieldsFromStorage().then(() => {
      // If sync changed anything, it would have triggered a save & notify
      // which StoryEngineUI listens to.
    });
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
    const fieldConfigs: FieldConfig[] = [
      {
        id: "storyPrompt",
        label: "Story Prompt",
        description: "The initial creative spark for your story",
        placeholder: "Once upon a time in a world where...",
        icon: "bookOpen",
      },
      {
        id: "brainstorm",
        label: "Brainstorm",
        description: "Creative exploration and ideation",
        placeholder: "Let me explore the possibilities of this world...",
        icon: "cloud-lightning",
      },
      {
        id: "worldSnapshot",
        label: "Dynamic World Snapshot",
        description: "A snapshot of the world full of dynamic potential",
        placeholder: "The state of the world, its drivers, and tensions...",
        icon: "package",
      },
      // DULFS and other fields omitted from direct StoryManager sync for now due to type mismatch
      // They will remain as UI placeholders or need further data structure updates
      {
        id: "dulfs",
        label: "DULFS",
        description:
          "Dramatis Personae, Universe Systems, Locations, Factions, Situational Dynamics",
        placeholder: "Characters, world, setting, and story elements...",
        icon: "users",
      },
      {
        id: "dramatisPersonae",
        label: "Dramatis Personae",
        description: "Main characters and their relationships",
        placeholder: "Character names, descriptions, motivations...",
        icon: "user",
      },
      {
        id: "universeSystems",
        label: "Universe Systems",
        description: "Rules, magic, technology, and world mechanics",
        placeholder: "How this world works - magic, physics, etc...",
        icon: "settings" as IconId,
      },
      {
        id: "locations",
        label: "Locations",
        description: "Places where the story takes place",
        placeholder: "Settings, landmarks, environments...",
        icon: "map-pin" as IconId,
      },
      {
        id: "storyLorebooks",
        label: "Story Lorebooks",
        description: "Integrated lorebooks for story elements",
        placeholder: "Organized lore for story-specific elements...",
        icon: "book",
      },
    ];

    fieldConfigs.forEach((config) => {
      this.configs.set(config.id, config);
    });
  }

  public createSidebar(): UIPart {
    return column({
      content: [
        // Collapsible sections for all fields
        column({
          content: Array.from(this.configs.values()).map((config) =>
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
      return collapsibleSection({
        title: `${config.label} (Wand Active)`,
        iconId: config.icon,
        storageKey: `story:kse-section-${config.id}`,
        content: this.createWorkflowUI(session, config),
      });
    }

    // Standard View
    const content = this.storyManager.getFieldContent(config.id);

    return collapsibleSection({
      title: config.label,
      iconId: config.icon,
      storageKey: `story:kse-section-${config.id}`,
      content: [
        // Field description
        text({
          text: config.description,
        }),

        // Text input area
        multilineTextInput({
          id: `field-${config.id}`,
          placeholder: config.placeholder,
          initialValue: content,
          storageKey: `story:kse-field-${config.id}`,
          onChange: (newContent: string) =>
            this.handleFieldChange(config.id, newContent),
        }),

        // Action buttons (Edit, Generate, etc.)
        this.createFieldActions(config),
      ],
    });
  }

  private createWorkflowUI(session: FieldSession, config: FieldConfig): UIPart[] {
    const activeStage = session.selectedStage;
    
    // Debug logging for runtime error investigation
    if (!session.cycles || !session.cycles[activeStage]) {
      api.v1.log(`[UI Error] Invalid session state for ${config.id}. Stage: ${activeStage}, Cycles: ${JSON.stringify(Object.keys(session.cycles || {}))}`);
      // Fallback to prevent crash
      return [
        text({ text: `Error: Invalid session state. Please close and retry.` }),
        button({ text: "Close", callback: () => {
          this.agentCycleManager.endSession(config.id);
          this.onUpdateCallback();
        }})
      ];
    }

    const activeContent = session.cycles[activeStage].content;
    const update = () => this.onUpdateCallback();

    return [
      column({
        id: `wand-container-${config.id}`,
        content: [
          // Stage Selection
          text({
            text: "Workflow Stage:",
            style: { "font-weight": "bold", "margin-top": "8px" },
          }),
          row({
            id: `wand-stage-selector-${config.id}`,
            style: { "align-items": "center", "margin-bottom": "16px", gap: "16px" },
            content: [
              row({
                content: [
                  button({
                    text: "1. Generate",
                    iconId: "file-text",
                    style:
                      activeStage === "generate"
                        ? { "background-color": "rgb(245, 243, 194)", color: "black" }
                        : {},
                    callback: () => {
                      session.selectedStage = "generate";
                      update();
                    },
                  }),
                  button({
                    text: "2. Review",
                    iconId: "eye",
                    style:
                      activeStage === "review"
                        ? { "background-color": "rgb(245, 243, 194)", color: "black" }
                        : {},
                    callback: () => {
                      session.selectedStage = "review";
                      update();
                    },
                  }),
                  button({
                    text: "3. Refine",
                    iconId: "feather",
                    style:
                      activeStage === "refine"
                        ? { "background-color": "rgb(245, 243, 194)", color: "black" }
                        : {},
                    callback: () => {
                      session.selectedStage = "refine";
                      update();
                    },
                  }),
                ],
                style: { gap: "8px" },
              }),
              checkboxInput({
                id: `wand-auto-checkbox-${config.id}`,
                label: "Auto-Advance",
                initialValue: session.isAuto,
                onChange: (val) => {
                  session.isAuto = val;
                },
              }),
            ],
          }),

          // Active Stage Content
          text({
            text: `Stage Output (${activeStage.toUpperCase()}):`,
            style: { "font-weight": "bold" },
          }),
          multilineTextInput({
            id: `wand-stage-content-${config.id}`,
            initialValue: activeContent,
            placeholder: `Output for ${activeStage} stage will appear here...`,
            onChange: (val) => {
              session.cycles[activeStage].content = val;
              session.currentContent = val;
            },
            style: { height: "200px" },
          }),

          // Actions
          row({
            id: `wand-action-row-${config.id}`,
            style: { "margin-top": "24px", "justify-content": "space-between" },
            content: [
              (() => {
                if (session.budgetState === "waiting_for_user") {
                  return button({
                    id: `wand-continue-btn-${config.id}`,
                    text: "⚠️ Continue",
                    style: {
                      "background-color": "#fff3cd",
                      color: "#856404",
                      "font-weight": "bold",
                    },
                    callback: () => {
                      if (session.budgetResolver) {
                        session.budgetState = "waiting_for_timer";
                        session.budgetResolver();
                        session.budgetResolver = undefined;
                        update();
                      }
                    },
                  });
                }
                if (session.budgetState === "waiting_for_timer") {
                  return button({
                    id: `wand-wait-btn-${config.id}`,
                    text: "⏳ Refilling...",
                    style: {
                      "background-color": "#e2e3e5",
                      color: "#383d41",
                    },
                    callback: () => {
                      // Allow cancel during wait
                      if (session.cancellationSignal) {
                        session.cancellationSignal.cancel();
                        api.v1.ui.toast("Wait cancelled", { type: "info" });
                        update();
                      }
                    },
                  });
                }
                if (session.cycles[activeStage].status === "running") {
                  return button({
                    id: `wand-cancel-btn-${config.id}`,
                    text: "🚫 Cancel",
                    style: {
                      "font-weight": "bold",
                      "background-color": "#ffcccc",
                      color: "red",
                    },
                    callback: () => {
                      if (session.cancellationSignal) {
                        session.cancellationSignal.cancel();
                        api.v1.ui.toast("Generation cancelled", {
                          type: "info",
                        });
                        update();
                      }
                    },
                  });
                }
                return button({
                  id: `wand-ignite-btn-${config.id}`,
                  text: "⚡ Ignite",
                  style: { "font-weight": "bold" },
                  callback: () => {
                    if (session.isAuto) {
                      this.agentWorkflowService.runAutoGeneration(session, update);
                    } else {
                      this.agentWorkflowService.runStageGeneration(session, update);
                    }
                  },
                });
              })(),
              row({
                id: `wand-save-discard-row-${config.id}`,
                content: [
                  button({
                    id: `wand-save-btn-${config.id}`,
                    text: "Save & Close",
                    callback: () => {
                      // Ensure we save the content of the currently viewed stage
                      session.currentContent = session.cycles[activeStage].content;
                      this.saveWandResult(session);
                    },
                  }),
                  button({
                    id: `wand-discard-btn-${config.id}`,
                    text: "Close",
                    callback: () => {
                      // Close means cancel any running gen and revert UI
                      if (session.cancellationSignal) {
                        session.cancellationSignal.cancel();
                      }
                      this.agentCycleManager.endSession(session.fieldId);
                      update();
                    },
                  }),
                ],
                style: { gap: "8px" },
              }),
            ],
          }),
        ],
      }),
    ];
  }

  private createFieldActions(config: FieldConfig): UIPart {
    // Story Prompt is user-only, no AI generation
    if (config.id === "storyPrompt") {
      return row({ content: [] });
    }

    const isPrimaryField = ["brainstorm", "worldSnapshot"].includes(config.id);

    if (isPrimaryField) {
      return row({
        content: [
          button({
            text: "🪄 Wand",
            callback: () => this.handleWandClick(config.id),
          }),
        ],
      });
    }

    // For secondary fields, just show a simple edit button
    return row({
      content: [
        button({
          text: "Edit",
          callback: () => this.handleFieldEdit(config.id),
        }),
      ],
    });
  }

  private handleWandClick(fieldId: string): void {
    const config = this.configs.get(fieldId);
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

  private handleFieldEdit(fieldId: string): void {
    const config = this.configs.get(fieldId);
    if (!config) return;

    // Focus or simple interaction placeholder
    api.v1.log(`Editing field: ${config.label}`);
    api.v1.ui.toast(`Ready to edit ${config.label}`, { type: "info" });
  }

  // Public methods for external access
  public getFieldContent(fieldId: string): string {
    return this.storyManager.getFieldContent(fieldId);
  }

  public setFieldContent(fieldId: string, content: string): void {
    this.storyManager.setFieldContent(fieldId, content);
  }
}