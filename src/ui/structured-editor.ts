import { StoryManager } from "../core/story-manager";

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

  constructor(storyManager: StoryManager) {
    this.storyManager = storyManager;
    this.initializeFieldConfigs();
    this.syncFieldsFromStorage().then(() => {
      this.sidebar = this.createSidebar();
      // Re-trigger a UI update through the manager if needed,
      // but here we are just initializing.
    });
    this.sidebar = this.createSidebar();
  }

  private async syncFieldsFromStorage(): Promise<void> {
    for (const config of this.configs.values()) {
      // We use the storage key directly from storyStorage
      const savedContent = await api.v1.storyStorage.get(
        `kse-field-${config.id}`,
      );
      if (savedContent && typeof savedContent === "string") {
        await this.storyManager.setFieldContent(config.id, savedContent, false);
      }
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

    if (!isPrimaryField) {
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

    // For primary fields, show action buttons
    return row({
      content: [
        button({
          text: "Generate",
          callback: () => this.handleFieldGenerate(config.id),
        }),
        button({
          text: "Edit",
          callback: () => this.handleFieldEdit(config.id),
        }),
      ],
    });
  }

  private handleFieldChange(fieldId: string, content: string): void {
    // Update StoryManager which will trigger UI updates via the listener in StoryEngineUI
    this.storyManager.setFieldContent(fieldId, content);
  }

  private handleFieldGenerate(fieldId: string): void {
    const config = this.configs.get(fieldId);
    if (!config) return;

    // Placeholder for generation logic
    api.v1.log(`Generating content for ${config.label}`);

    // This would integrate with the AgentCycle system
    // For now, just show a placeholder
    const currentContent = this.storyManager.getFieldContent(fieldId);
    const newContent =
      currentContent + `\n\n[Generated content for ${config.label}]`;

    this.storyManager.setFieldContent(fieldId, newContent);
  }

  private handleFieldEdit(_fieldId: string): void {
    // Focus the field (would need additional UI integration)
    api.v1.log(`Editing field`);

    // We need to trigger a re-render to reflect the expanded state change
    // Since this is a local UI state change, we might need a way to tell the parent to re-render
    // or we can update the StoryManager with a dummy change, OR better:
    // StoryEngineUI should handle re-renders.
    // Ideally StructuredEditor would emit an event.
    // For now, we'll just rely on the user manually expanding if this doesn't work perfectly,
    // or we can hack it by calling a refresh method if we had one.
    // Given the constraints, I will leave it as updating state.
    // If we want to force update, we might need to expose a method or callback.
  }

  // Public methods for external access
  public getFieldContent(fieldId: string): string {
    return this.storyManager.getFieldContent(fieldId);
  }

  public setFieldContent(fieldId: string, content: string): void {
    this.storyManager.setFieldContent(fieldId, content);
  }
}
