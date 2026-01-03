import { StoryManager } from "../core/story-manager";
import { AgentCycleManager, FieldSession } from "../core/agent-cycle";
import {
  hyperGenerate,
  hyperContextBuilder,
} from "../hyper-generator";

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
    // Story Prompt is user-only, no AI generation
    if (config.id === "storyPrompt") {
      return row({ content: [] });
    }

    const isPrimaryField = ["brainstorm", "synopsis"].includes(config.id);

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
      const activeStage = session.selectedStage;
      const activeContent = session.cycles[activeStage].content;

      return [
        column({
          id: `wand-modal-container-${config.id}`,
          content: [
            // Stage Selection
            text({
              text: "Workflow Stage:",
              style: { "font-weight": "bold", "margin-top": "8px" },
            }),
            row({
              id: "wand-stage-selector",
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
                  id: "wand-auto-checkbox",
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
              id: "wand-stage-content",
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
              id: "wand-action-row",
              style: { "margin-top": "24px", "justify-content": "space-between" },
              content: [
                (() => {
                  if (session.budgetState === "waiting_for_user") {
                    return button({
                      id: "wand-continue-btn",
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
                      id: "wand-wait-btn",
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
                        }
                      },
                    });
                  }
                  if (session.cycles[activeStage].status === "running") {
                    return button({
                      id: "wand-cancel-btn",
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
                        }
                      },
                    });
                  }
                  return button({
                    id: "wand-ignite-btn",
                    text: "⚡ Ignite",
                    style: { "font-weight": "bold" },
                    callback: () => {
                      if (session.isAuto) {
                        this.runAutoGeneration(session, update);
                      } else {
                        this.runStageGeneration(session, update);
                      }
                    },
                  });
                })(),
                row({
                  id: "wand-save-discard-row",
                  content: [
                    button({
                      id: "wand-save-btn",
                      text: "Save to Field",
                      callback: () => {
                        // Ensure we save the content of the currently viewed stage
                        session.currentContent = session.cycles[activeStage].content;
                        this.saveWandResult(session, modalInstance);
                      },
                    }),
                    button({
                      id: "wand-discard-btn",
                      text: "Close",
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

  private async runAutoGeneration(
    session: FieldSession,
    updateFn: () => void,
  ): Promise<void> {
    const stages: ("generate" | "review" | "refine")[] = ["generate", "review", "refine"];
    const startIndex = stages.indexOf(session.selectedStage);
    
    // Iterate from current stage to the end
    for (let i = startIndex; i < stages.length; i++) {
        // If cancelled during auto-run, stop
        if (session.cancellationSignal && session.cancellationSignal.cancelled) {
            break;
        }

        session.selectedStage = stages[i];
        updateFn(); // Switch tab
        
        const success = await this.runStageGeneration(session, updateFn);
        if (!success) {
            session.isAuto = false;
            updateFn();
            break;
        }
        
        // Small pause between stages for visual clarity
        if (i < stages.length - 1) {
            await api.v1.timers.sleep(500);
        }
    }

    // Automatically disable auto after completion
    session.isAuto = false;
    updateFn();
  }

  private async runStageGeneration(
    session: FieldSession,
    updateFn: () => void,
  ): Promise<boolean> {
    const stage = session.selectedStage;
    session.cycles[stage].status = "running";
    session.cycles[stage].content = ""; // Clear previous content
    session.currentContent = ""; 
    
    // @ts-ignore
    session.cancellationSignal = await api.v1.createCancellationSignal();
    updateFn();

    try {
      // 1. Load Prompts
      const systemPrompt = (await api.v1.config.get("system_prompt")) || "";
      const storyPromptContent = this.storyManager.getFieldContent("storyPrompt");

      let userPrompt = "";
      let contextMessages: Message[] = [];
      const systemMsg: Message = { role: "system", content: systemPrompt };

      // 2. Build Context based on Stage
      if (stage === "generate") {
        const promptKey =
          session.fieldId === "brainstorm"
            ? "brainstorm_prompt"
            : "brainstorm_prompt"; // Fallback for others
        userPrompt = (await api.v1.config.get(promptKey)) || "";

        contextMessages = hyperContextBuilder(
          systemMsg,
          { role: "user", content: userPrompt },
          { role: "assistant", content: "" },
          [{ role: "user", content: `STORY PROMPT:\n${storyPromptContent}` }],
        );
      } else if (stage === "review") {
        userPrompt = (await api.v1.config.get("critique_prompt")) || "";
        const contentToReview = session.cycles.generate.content;

        contextMessages = hyperContextBuilder(
          systemMsg,
          { role: "user", content: userPrompt },
          { role: "assistant", content: "" },
          [
            { role: "user", content: `STORY PROMPT:\n${storyPromptContent}` },
            {
              role: "assistant",
              content: `CONTENT TO REVIEW:\n${contentToReview}`,
            },
          ],
        );
      } else if (stage === "refine") {
        userPrompt = (await api.v1.config.get("refine_prompt")) || "";
        const contentToRefine = session.cycles.generate.content;
        const critique = session.cycles.review.content;

        contextMessages = hyperContextBuilder(
          systemMsg,
          { role: "user", content: userPrompt },
          { role: "assistant", content: "" },
          [
            { role: "user", content: `STORY PROMPT:\n${storyPromptContent}` },
            {
              role: "assistant",
              content: `DRAFT CONTENT:\n${contentToRefine}`,
            },
            { role: "user", content: `CRITIQUE:\n${critique}` },
          ],
        );
      }

      // 3. Generate
      if (!session.cancellationSignal) throw new Error("Failed to create cancellation signal");

      const result = await hyperGenerate(
        contextMessages,
        {
          maxTokens: 2048,
          minTokens: 50,
          onBudgetWait: (available, needed, time) => {
            session.budgetState = "waiting_for_user";
            session.budgetWaitTime = time;
            updateFn();
            return new Promise<void>((resolve) => {
              session.budgetResolver = resolve;
            });
          },
          onBudgetResume: (available) => {
            session.budgetState = "normal";
            updateFn();
          },
        },
        (text) => {
          session.cycles[stage].content += text; // Append delta
          session.currentContent = session.cycles[stage].content;
          updateFn();
        },
        "background",
        session.cancellationSignal,
      );

      session.cycles[stage].content = result;
      session.cycles[stage].status = "completed";
      session.currentContent = result;
      return true;
    } catch (e: any) {
      if (
        e.message &&
        (e.message.includes("cancelled") || e.message.includes("Aborted"))
      ) {
        session.cycles[stage].status = "idle";
        api.v1.log("Generation cancelled");
        return false;
      } else {
        session.cycles[stage].status = "idle";
        api.v1.ui.toast(`Generation failed: ${e.message}`, { type: "error" });
        api.v1.log(`Generation failed: ${e}`);
        return false;
      }
    } finally {
      session.cancellationSignal = undefined;
      // Ensure we don't leave it in running state if something weird happened
      if (session.cycles[stage].status === "running") {
        session.cycles[stage].status = "idle";
      }
      updateFn();
    }
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
