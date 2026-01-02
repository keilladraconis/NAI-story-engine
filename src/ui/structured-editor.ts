const { column, row, text, button, multilineTextInput, collapsibleSection } =
  api.v1.ui.part;

interface FieldConfig {
  id: string;
  label: string;
  description: string;
  placeholder: string;
  icon: IconId;
  maxCharacters?: number;
  linkedEntities?: string[];
}

export class StructuredEditor {
  private configs: Map<string, FieldConfig> = new Map();
  private fieldStates: Map<string, { expanded: boolean; content: string }> =
    new Map();
  sidebar: UIPart;

  constructor() {
    this.initializeFieldConfigs();
    this.loadFieldStates();
    this.sidebar = this.createSidebar();
  }

  private initializeFieldConfigs(): void {
    const fieldConfigs: FieldConfig[] = [
      {
        id: "storyPrompt",
        label: "Story Prompt",
        description: "The initial creative spark for your story",
        placeholder: "Once upon a time in a world where...",
        icon: "bookOpen",
        maxCharacters: 1000,
      },
      {
        id: "brainstorm",
        label: "Brainstorm",
        description: "Creative exploration and ideation",
        placeholder: "Let me explore the possibilities of this world...",
        icon: "cloud-lightning",
        maxCharacters: 2000,
      },
      {
        id: "synopsis",
        label: "Synopsis/Summary",
        description: "Structured overview of the story",
        placeholder: "In a world where...",
        icon: "package",
        maxCharacters: 1500,
      },
      {
        id: "dulfs",
        label: "DULFS",
        description:
          "Dramatis Personae, Universe Systems, Locations, Factions, Situational Dynamics",
        placeholder: "Characters, world, setting, and story elements...",
        icon: "users",
        maxCharacters: 3000,
      },
      {
        id: "dramatisPersonae",
        label: "Dramatis Personae",
        description: "Main characters and their relationships",
        placeholder: "Character names, descriptions, motivations...",
        icon: "user",
        maxCharacters: 2000,
      },
      {
        id: "universeSystems",
        label: "Universe Systems",
        description: "Rules, magic, technology, and world mechanics",
        placeholder: "How this world works - magic, physics, etc...",
        icon: "settings" as IconId,
        maxCharacters: 2000,
      },
      {
        id: "locations",
        label: "Locations",
        description: "Places where the story takes place",
        placeholder: "Settings, landmarks, environments...",
        icon: "map-pin" as IconId,
        maxCharacters: 1500,
      },
      {
        id: "storyLorebooks",
        label: "Story Lorebooks",
        description: "Integrated lorebooks for story elements",
        placeholder: "Organized lore for story-specific elements...",
        icon: "book",
        maxCharacters: 2500,
      },
    ];

    fieldConfigs.forEach((config) => {
      this.configs.set(config.id, config);
      // Initialize field state if not exists
      if (!this.fieldStates.has(config.id)) {
        this.fieldStates.set(config.id, { expanded: true, content: "" });
      }
    });
  }

  private loadFieldStates(): void {
    try {
      // Load field states from storage
      const savedStates = api.v1.storyStorage.get("kse-field-states");
      if (savedStates && typeof savedStates === "object") {
        Object.entries(savedStates).forEach(([fieldId, state]) => {
          if (this.configs.has(fieldId) && typeof state === "object") {
            this.fieldStates.set(fieldId, {
              expanded: state.expanded || true,
              content: state.content || "",
            });
          }
        });
      }
    } catch (error) {
      api.v1.log("Failed to load field states:", error);
    }
  }

  private saveFieldStates(): void {
    try {
      const states = Object.fromEntries(this.fieldStates.entries()) as Record<
        string,
        { expanded: boolean; content: string }
      >;
      api.v1.storyStorage.set("kse-field-states", states);
    } catch (error) {
      api.v1.log("Failed to save field states:", error);
    }
  }

  private createSidebar(): UIPart {
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
    const fieldState = this.fieldStates.get(config.id)!;

    return collapsibleSection({
      title: config.label,
      iconId: config.icon,
      initialCollapsed: !fieldState.expanded,
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
          initialValue: fieldState.content,
          onChange: (content: string) =>
            this.handleFieldChange(config.id, content),
        }),

        // Character count and validation
        row({
          content: [
            text({
              text: `Characters: ${fieldState.content.length}${config.maxCharacters ? `/${config.maxCharacters}` : ""}`,
              style: {
                color:
                  config.maxCharacters &&
                  fieldState.content.length > config.maxCharacters
                    ? "#d32f2f"
                    : "#666",
              },
            }),
          ],
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
    const fieldState = this.fieldStates.get(fieldId)!;
    fieldState.content = content;
    this.fieldStates.set(fieldId, fieldState);
    this.saveFieldStates();

    // Trigger UI update
    this.updateFieldDisplay(fieldId);
  }

  private handleFieldGenerate(fieldId: string): void {
    const config = this.configs.get(fieldId);
    if (!config) return;

    // Placeholder for generation logic
    api.v1.log(`Generating content for ${config.label}`);

    // This would integrate with the AgentCycle system
    // For now, just show a placeholder
    const fieldState = this.fieldStates.get(fieldId)!;
    fieldState.content = `Generated content for ${config.label}\n\n[Content would be generated here]`;
    this.fieldStates.set(fieldId, fieldState);
    this.saveFieldStates();
    this.updateFieldDisplay(fieldId);
  }

  private handleFieldEdit(_fieldId: string): void {
    const fieldState = this.fieldStates.get(_fieldId)!;
    fieldState.expanded = true;
    this.fieldStates.set(_fieldId, fieldState);
    this.saveFieldStates();

    // Focus the field (would need additional UI integration)
    api.v1.log(`Editing field`);
  }

  private updateFieldDisplay(_fieldId: string): void {
    // In a real implementation, this would update the UI
    // For now, just trigger a re-render by recreating the sidebar
    this.sidebar = this.createSidebar();
  }

  // Public methods for external access
  public getFieldContent(fieldId: string): string {
    return this.fieldStates.get(fieldId)?.content || "";
  }

  public setFieldContent(fieldId: string, content: string): void {
    const fieldState = this.fieldStates.get(fieldId)!;
    fieldState.content = content;
    this.fieldStates.set(fieldId, fieldState);
    this.saveFieldStates();
    this.updateFieldDisplay(fieldId);
  }

  public expandField(fieldId: string): void {
    const fieldState = this.fieldStates.get(fieldId)!;
    fieldState.expanded = true;
    this.fieldStates.set(fieldId, fieldState);
    this.saveFieldStates();
    this.updateFieldDisplay(fieldId);
  }

  public collapseField(fieldId: string): void {
    const fieldState = this.fieldStates.get(fieldId)!;
    fieldState.expanded = false;
    this.fieldStates.set(fieldId, fieldState);
    this.saveFieldStates();
    this.updateFieldDisplay(fieldId);
  }
}
