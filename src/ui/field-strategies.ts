import { FieldConfig, FieldID } from "../config/field-definitions";
import { StoryManager, DULFSField } from "../core/story-manager";
import { AgentWorkflowService } from "../core/agent-workflow";
import {
  createHeaderWithToggle,
  createToggleableContent,
  createResponsiveGenerateButton,
} from "./ui-components";

const { row, column, text, button, checkboxInput } =
  api.v1.ui.part;

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
  runListGeneration: () => Promise<void>;
  getListGenerationState: () => { isRunning: boolean; signal?: any };
  cancelListGeneration: () => void;
}

export interface TextRenderContext extends BaseRenderContext {
  handleFieldChange: (content: string) => void;
  // Generator Sync
  setAttgEnabled?: (enabled: boolean) => Promise<void>;
  isAttgEnabled?: () => boolean;
  setStyleEnabled?: (enabled: boolean) => Promise<void>;
  isStyleEnabled?: () => boolean;
  runFieldGeneration?: (fieldId: string) => Promise<void>;
}

export type RenderContext = ListRenderContext & TextRenderContext;

export interface FieldRenderStrategy<T extends BaseRenderContext = RenderContext> {
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
    } = context;

    const list = storyManager.getDulfsList(config.id);
    const genState = getListGenerationState
      ? getListGenerationState()
      : { isRunning: false };
    const isEnabled = storyManager.isDulfsEnabled(config.id);

    // --- Actions Row ---
    const actionsRow = row({
      style: { "margin-bottom": "12px", gap: "8px", "align-items": "center" },
      content: [
        // Responsive Generate Button
        createResponsiveGenerateButton(
          `list-gen-btn-${config.id}`,
          { isRunning: genState.isRunning },
          {
            onStart: () => {
              if (runListGeneration) runListGeneration();
            },
            onCancel: () => {
              if (cancelListGeneration) cancelListGeneration();
            },
          },
          "Generate",
        ),
        button({
          text: "Add Entry",
          iconId: "plus",
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
      const toggle = toggleItemEditMode
        ? () => toggleItemEditMode(item.id)
        : () => {};

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
            content: [
              createToggleableContent(
                isEditing,
                item.content,
                "Entry details...",
                undefined, // No storage key to prevent sync conflicts; StoryManager is source of truth
                (newContent) => {
                  storyManager.updateDulfsItem(config.id, item.id, {
                    content: newContent,
                  });
                },
                { "min-height": "60px", width: "100%" },
              ),
            ],
          }),
          // Action Buttons (Compact column)
          column({
            style: { "margin-left": "4px", gap: "4px" },
            content: [
              button({
                iconId: isEditing ? "eye" : "edit-3",
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
    } = context;

    const content = storyManager.getFieldContent(config.id);
    const session = agentWorkflowService.getSession(config.id);

    // Sync Checkbox (for ATTG/Style)
    let syncCheckbox: UIPart = null;
    if (
      config.id === FieldID.ATTG &&
      isAttgEnabled &&
      setAttgEnabled
    ) {
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
    }

    const genButton = createResponsiveGenerateButton(
      `gen-btn-${config.id}`,
      {
        isRunning: session?.isRunning || false,
        budgetState: session?.budgetState,
      },
      {
        onStart: () => {
          if (runFieldGeneration) {
            runFieldGeneration(config.id);
          }
        },
        onCancel: () => {
          if (session?.cancellationSignal) {
            session.cancellationSignal.cancel();
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

export function getFieldStrategy(config: FieldConfig): FieldRenderStrategy<any> {
  if (config.layout === "list") {
    return listStrategy;
  }

  return textStrategy;
}
