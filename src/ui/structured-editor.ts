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

  private async handleFieldGenerate(fieldId: string): Promise<void> {
    const config = this.configs.get(fieldId);
    if (!config) return;

    // Placeholder for generation logic
    api.v1.log(`Generating content for ${config.label}`);

    const currentContent = this.storyManager.getFieldContent(fieldId);
    const newContent =
      currentContent +
      (currentContent ? "\n" : "") +
      `[Generated content for ${config.label} at ${new Date().toLocaleTimeString()}]`;

    // 1. Update StoryManager (in-memory)
    await this.storyManager.setFieldContent(fieldId, newContent, false);

    // 2. Update the storage key used by the UI part so it reflects the change
    await api.v1.storyStorage.set(`kse-field-${fieldId}`, newContent);

    // 3. Commit to history (this will also save STORY_DATA and notify listeners)
    await this.storyManager.commit();

    api.v1.ui.toast(`Generated content for ${config.label}`, {
      type: "success",
    });
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
