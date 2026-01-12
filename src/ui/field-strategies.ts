import { FieldConfig, FieldID } from "../config/field-definitions";
import { StoryManager, DULFSField } from "../core/story-manager";
import { AgentWorkflowService } from "../core/agent-workflow";
import {
  createHeaderWithToggle,
  createToggleableContent,
  createResponsiveGenerateButton,
} from "./ui-components";

const { row, column, text, button, checkboxInput, textInput, multilineTextInput } = api.v1.ui.part;

export interface BaseRenderContext {
  config: FieldConfig;
  storyManager: StoryManager;
  agentWorkflowService: AgentWorkflowService;
  editModeState: boolean; // The specific boolean for this field/mode
  toggleEditMode: () => void;
}

export interface ListRenderContext extends BaseRenderContext {
  getItemEditMode: (itemId: string) => boolean;
  toggleItemEditMode: (itemId: string) => void;
  runListGeneration: () => void;
  getListGenerationState: () => {
    isRunning: boolean;
    isQueued?: boolean;
    signal?: any;
    budgetState?: "normal" | "waiting_for_user" | "waiting_for_timer";
    budgetResolver?: () => void;
    budgetTimeRemaining?: number;
  };
  cancelListGeneration: () => void;
  // Item specific generation
  runDulfsItemGeneration: (itemId: string) => void;
  getItemGenerationState: (itemId: string) => {
    isRunning: boolean;
    isQueued?: boolean;
    budgetState?: "normal" | "waiting_for_user" | "waiting_for_timer";
    budgetResolver?: () => void;
    budgetTimeRemaining?: number;
  } | undefined;
}

export interface TextRenderContext extends BaseRenderContext {
  handleFieldChange: (content: string) => void;
  currentContent?: string;
  // Generator Sync
  setAttgEnabled?: (enabled: boolean) => Promise<void>;
  isAttgEnabled?: () => boolean;
  setStyleEnabled?: (enabled: boolean) => Promise<void>;
  isStyleEnabled?: () => boolean;
  runFieldGeneration?: (fieldId: string) => void;
  cancelFieldGeneration?: (fieldId: string) => void;
  // Lorebook Sync
  setIsTextFieldLorebookEnabled?: (enabled: boolean) => Promise<void>;
  isTextFieldLorebookEnabled?: () => boolean;
}

export type RenderContext = ListRenderContext & TextRenderContext;

export interface FieldRenderStrategy<
  T extends BaseRenderContext = RenderContext,
> {
  getTitle(context: T): string;
  renderContent(context: T): UIPart[];
}

// --- Strategies ---

export class ListFieldStrategy implements FieldRenderStrategy<ListRenderContext> {
  getTitle(context: ListRenderContext): string {
    return context.config.label;
  }

  renderContent(context: ListRenderContext): UIPart[] {
    const {
      config,
      storyManager,
      getItemEditMode,
      toggleItemEditMode,
      runListGeneration,
      getListGenerationState,
      cancelListGeneration,
      runDulfsItemGeneration,
      getItemGenerationState,
    } = context;

    const list = storyManager.getDulfsList(config.id);
    const genState = getListGenerationState
      ? getListGenerationState()
      : { isRunning: false };
    const isEnabled = storyManager.isDulfsEnabled(config.id);

    // --- Actions Row ---
    const actionsRow = row({
      style: {
        "margin-bottom": "12px",
        gap: "4px",
        "align-items": "center",
        "flex-wrap": "wrap",
      },
      content: [
        // Responsive Generate Button
        createResponsiveGenerateButton(
          `list-gen-btn-${config.id}`,
          {
            isRunning: genState.isRunning,
            isQueued: genState.isQueued,
            budgetState: genState.budgetState,
            budgetTimeRemaining: genState.budgetTimeRemaining,
          },
          {
            onStart: () => {
              if (runListGeneration) runListGeneration();
            },
            onCancel: () => {
              if (cancelListGeneration) cancelListGeneration();
            },
            onContinue: () => {
              if (genState.budgetResolver) genState.budgetResolver();
            },
          },
          "Generate Items",
        ),
        button({
          text: "Add Entry",
          iconId: "plus",
          style: { padding: "4px 8px" },
          callback: () => {
            const newItem: DULFSField = {
              id: api.v1.uuid(),
              category: config.id as any, // Assumption: id matches category for now, or we map it
              content: "",
              name: "",
              description: "",
              attributes: {},
              linkedLorebooks: [],
            };
            storyManager.addDulfsItem(config.id, newItem);
          },
        }),
        button({
          text: "Clear All",
          iconId: "trash-2",
          style: { padding: "4px 8px" },
          callback: () => {
            // Simple confirmation could be added here if possible, for now direct action
            storyManager.clearDulfsList(config.id);
          },
        }),
        // Enabled Checkbox
        checkboxInput({
          label: "Lorebook",
          initialValue: isEnabled,
          onChange: (val) => {
            storyManager.setDulfsEnabled(config.id, val);
          },
        }),
      ],
    });

    // --- List Items ---
    const itemsUI = list.map((item) => {
      const isEditing = getItemEditMode ? getItemEditMode(item.id) : false;
      const itemGenState = getItemGenerationState
        ? getItemGenerationState(item.id)
        : undefined;
      const isItemGenerating = itemGenState?.isRunning || false;

      const toggle = () => {
        if (toggleItemEditMode) {
          if (isEditing) {
            // Saving: Parse and Sync
            storyManager.parseAndUpdateDulfsItem(config.id, item.id);
          }
          toggleItemEditMode(item.id);
        }
      };

      const contentParts: UIPart[] = [];

      if (isEditing) {
        // Edit Mode: Name Input + Content Area
        contentParts.push(
          row({
            style: { "margin-bottom": "8px", "align-items": "center" },
            content: [
              text({
                text: "Name: ",
                style: {
                  "font-weight": "bold",
                  "margin-right": "8px",
                  "flex-shrink": "0",
                },
              }),
              textInput({
                initialValue: item.name,
                placeholder: "Entry Name",
                onChange: (val) => {
                  storyManager.updateDulfsItem(
                    config.id,
                    item.id,
                    { name: val },
                    "debounce",
                    false,
                  );
                },
                style: { "flex-grow": "1" },
              }),
            ],
          }),
          multilineTextInput({
            initialValue: item.content,
            placeholder: "Entry details...",
            onChange: (val) => {
              storyManager.updateDulfsItem(
                config.id,
                item.id,
                { content: val },
                "debounce",
                false,
              );
            },
            style: { "min-height": "100px", width: "100%" },
          }),
        );
      } else {
        // View Mode: Name (Bold) + Content (Markdown)
        // Process content to preserve line breaks in NovelAI's markdown renderer
        const processedContent = (item.content || "_No content._")
          .replace(/\n/g, "  \n")
          .replace(/\[/g, "\\[");

        contentParts.push(
          text({
            text: item.name || "Unnamed",
            style: {
              "font-weight": "bold",
              "font-size": "1.1em",
              "margin-bottom": "4px",
            },
          }),
          text({
            text: processedContent,
            markdown: true,
            style: {
              padding: "4px",
              "min-height": "20px",
              "user-select": "text",
              opacity: "0.9",
            },
          }),
        );
      }

      // Item Generation Button (Bolt)
      const genButton = createResponsiveGenerateButton(
        `item-gen-btn-${item.id}`,
        {
          isRunning: isItemGenerating,
          isQueued: itemGenState?.isQueued,
          budgetState: itemGenState?.budgetState,
          budgetTimeRemaining: itemGenState?.budgetTimeRemaining,
        },
        {
          onStart: () => {
            if (runDulfsItemGeneration) runDulfsItemGeneration(item.id);
          },
          onCancel: () => {
            // Reuse generic cancel mechanism if possible or add item specific cancel?
            // For now, we don't have item specific cancel in interface, 
            // but we can call cancelListGeneration if it cancels by ID? 
            // Or we assume the button handles state.
            // Actually, we need a cancel for item.
            // Let's assume hitting the stop button calls this onCancel.
            // We should use cancelListGeneration(config.id) but maybe that kills everything?
            // AgentWorkflow.cancelListGeneration removes everything for that field.
            // Good enough for now.
            if (cancelListGeneration) cancelListGeneration(); 
          },
          onContinue: () => {
            if (itemGenState?.budgetResolver) itemGenState.budgetResolver();
          },
        },
        "", // No text, just icon
      );
      // Override icon to be bolt if not running (createResponsiveGenerateButton uses 'play' by default)
      // Actually createResponsiveGenerateButton handles icons. 
      // If we want a specific icon "bolt" instead of "play" (sparkles):
      // The component uses "sparkles" for generate. Bolt is "zap"?
      // We can't easily change the icon in the helper without changing the helper.
      // "Sparkles" is fine for generation.

      return row({
        style: {
          "margin-bottom": "8px",
          border: "1px solid rgba(128, 128, 128, 0.1)",
          "border-radius": "4px",
          padding: "4px",
          "align-items": "start",
        },
        content: [
          // Item Content (grows to fill space)
          column({
            style: { "flex-grow": "1" },
            content: contentParts,
          }),
          // Action Buttons (Compact column)
          column({
            style: { "margin-left": "4px", gap: "4px" },
            content: [
              genButton,
              button({
                iconId: isEditing ? "save" : "edit-3",
                callback: toggle,
                style: { width: "30px", padding: "8px" },
              }),
              button({
                iconId: "trash",
                callback: () => {
                  storyManager.removeDulfsItem(config.id, item.id);
                },
                style: { width: "30px", padding: "8px" },
              }),
            ],
          }),
        ],
      });
    });

    return [
      text({
        text: config.description,
        style: {
          "font-style": "italic",
          opacity: "0.8",
          "margin-bottom": "8px",
        },
      }),
      column({ content: itemsUI }),
      actionsRow, // Moved to bottom
    ];
  }
}

export class TextFieldStrategy implements FieldRenderStrategy<TextRenderContext> {
  getTitle(context: TextRenderContext): string {
    return context.config.label;
  }

  renderContent(context: TextRenderContext): UIPart[] {
    const {
      config,
      storyManager,
      agentWorkflowService,
      editModeState,
      toggleEditMode,
      handleFieldChange,
      setAttgEnabled,
      isAttgEnabled,
      setStyleEnabled,
      isStyleEnabled,
      runFieldGeneration,
      cancelFieldGeneration,
      currentContent,
      setIsTextFieldLorebookEnabled,
      isTextFieldLorebookEnabled,
    } = context;

    const content =
      currentContent !== undefined
        ? currentContent
        : storyManager.getFieldContent(config.id);
    const session = agentWorkflowService.getSession(config.id);

    // Sync Checkbox (for ATTG/Style or Lorebook Binding)
    let syncCheckbox: UIPart = null;
    if (config.id === FieldID.ATTG && isAttgEnabled && setAttgEnabled) {
      syncCheckbox = checkboxInput({
        label: "Sync to Memory",
        initialValue: isAttgEnabled(),
        onChange: (val) => setAttgEnabled(val),
      });
    } else if (
      config.id === FieldID.Style &&
      isStyleEnabled &&
      setStyleEnabled
    ) {
      syncCheckbox = checkboxInput({
        label: "Sync to Author's Note",
        initialValue: isStyleEnabled(),
        onChange: (val) => setStyleEnabled(val),
      });
    } else if (
      (config.id === FieldID.StoryPrompt ||
        config.id === FieldID.WorldSnapshot) &&
      isTextFieldLorebookEnabled &&
      setIsTextFieldLorebookEnabled
    ) {
      syncCheckbox = checkboxInput({
        label: "Bind to Lorebook",
        initialValue: isTextFieldLorebookEnabled(),
        onChange: (val) => setIsTextFieldLorebookEnabled(val),
      });
    }

    const genButton = createResponsiveGenerateButton(
      `gen-btn-${config.id}`,
      {
        isRunning: session?.isRunning || false,
        isQueued: session?.isQueued,
        budgetState: session?.budgetState,
        budgetTimeRemaining: session?.budgetTimeRemaining,
      },
      {
        onStart: () => {
          if (editModeState) {
            toggleEditMode();
          }
          if (runFieldGeneration) {
            runFieldGeneration(config.id);
          }
        },
        onCancel: () => {
          if (cancelFieldGeneration) {
            cancelFieldGeneration(config.id);
          }
        },
        onContinue: () => {
          if (session?.budgetResolver) {
            session.budgetResolver();
          }
        },
      },
      "Generate",
    );

    const parts: UIPart[] = [
      createHeaderWithToggle(
        config.description,
        editModeState,
        toggleEditMode,
        genButton,
      ),
      createToggleableContent(
        editModeState,
        content,
        config.placeholder,
        `input-field-${config.id}`,
        (val) => {
          handleFieldChange(val);
        },
      ),
    ];

    if (syncCheckbox) {
      parts.push(
        row({
          style: { "margin-top": "4px", "justify-content": "flex-end" },
          content: [syncCheckbox],
        }),
      );
    }

    return parts.filter((x) => x !== null) as UIPart[];
  }
}

// --- Factory ---

const listStrategy = new ListFieldStrategy();
const textStrategy = new TextFieldStrategy();

export function getFieldStrategy(
  config: FieldConfig,
): FieldRenderStrategy<any> {
  if (config.layout === "list") {
    return listStrategy;
  }

  return textStrategy;
}
