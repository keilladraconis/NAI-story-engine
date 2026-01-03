import { StoryManager } from "../core/story-manager";
import { AgentCycleManager, FieldSession } from "../core/agent-cycle";

const { column, row, text, button, multilineTextInput, collapsibleSection } =
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

  constructor(storyManager: StoryManager, agentCycleManager: AgentCycleManager) {
    this.storyManager = storyManager;
    this.agentCycleManager = agentCycleManager;
    this.initializeFieldConfigs();
    this.sidebar = column({ content: [] }); // Placeholder

    this.syncFieldsFromStorage().then(() => {
      this.sidebar = this.createSidebar();
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
        id: "synopsis",
        label: "Synopsis/Summary",
        description: "Structured overview of the story",
        placeholder: "In a world where...",
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

  private createFieldActions(config: FieldConfig): UIPart {
    const isPrimaryField = ["storyPrompt", "brainstorm", "synopsis"].includes(
      config.id,
    );

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

    this.showWandModal(config);
  }

  private async showWandModal(config: FieldConfig): Promise<void> {
    const session = this.agentCycleManager.startSession(
      config.id,
      this.storyManager.getFieldContent(config.id),
    );

    let modalInstance: any = null;

    const renderModalContent = () => {
      return [
        column({
          id: `wand-modal-container-${config.id}`,
          content: [
            text({
              text: "Progress Visualization:",
              style: { "font-weight": "bold", "margin-top": "8px" },
            }),
            multilineTextInput({
              id: "wand-progress",
              initialValue: session.progress,
              onChange: (val) => {
                session.progress = val;
              },
            }),
            row({
              id: "wand-action-row",
              style: { "margin-top": "24px", "justify-content": "space-between" },
              content: [
                button({
                  id: "wand-generate-btn",
                  text: "Generate",
                  callback: () => {
                    this.runMvpGeneration(session, update);
                  },
                }),
                row({
                  id: "wand-save-discard-row",
                  content: [
                    button({
                      id: "wand-save-btn",
                      text: "Save",
                      callback: () => {
                        this.saveWandResult(session, modalInstance);
                      },
                    }),
                    button({
                      id: "wand-discard-btn",
                      text: "Discard",
                      callback: () => {
                        this.agentCycleManager.endSession(session.fieldId);
                        if (modalInstance) modalInstance.close();
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
    };

    const update = () => {
      if (modalInstance) {
        try {
          const content = renderModalContent();
          modalInstance.update({ content });
        } catch (e) {
          api.v1.log(`[Wand] Error during update: ${e}`);
        }
      }
    };

    modalInstance = await api.v1.ui.modal.open({
      title: `🪄 Agentic Workflow: ${config.label}`,
      size: "medium",
      content: renderModalContent(),
    });
  }

  private async runMvpGeneration(
    session: FieldSession,
    updateFn: () => void,
  ): Promise<void> {
    session.progress = "Running 3-stage cycle...\n";
    updateFn();

    await api.v1.timers.sleep(1000);
    session.progress += "> [Stage 1: Generate] Drafting content...\n";
    updateFn();

    await api.v1.timers.sleep(1500);
    session.progress += "> [Stage 2: Review] Critiquing draft...\n";
    updateFn();

    await api.v1.timers.sleep(1500);
    session.progress += "> [Stage 3: Refine] Polishing final version...\n";
    session.currentContent = `[Result of generation for ${session.fieldId} at ${new Date().toLocaleTimeString()}]\nThis is the high-quality refined content based on your prompt.`;
    session.progress += "\n✅ Generation complete!";
    updateFn();
  }

  private async saveWandResult(session: FieldSession, modal: any): Promise<void> {
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

    // 4. Force update the UI part just in case
    try {
      await api.v1.ui.updateParts([
        {
          id: `field-${session.fieldId}`,
          initialValue: session.currentContent,
        } as any,
      ]);
    } catch (e) {
      // Ignore
    }

    api.v1.ui.toast(`Saved generated content to ${session.fieldId}`, {
      type: "success",
    });
    this.agentCycleManager.endSession(session.fieldId);
    modal.close();
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
