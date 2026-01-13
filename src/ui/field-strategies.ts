import { FieldConfig, FieldID } from "../config/field-definitions";
import { StoryManager, DULFSField } from "../core/story-manager";
import { AgentWorkflowService } from "../core/agent-workflow";
import {
  createHeaderWithToggle,
  createToggleableContent,
  createResponsiveGenerateButton,
} from "./ui-components";

const { row, column, text, button, checkboxInput, textInput } = api.v1.ui.part;

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
  runDulfsItemGeneration: (itemId: string) => void; // Deprecated in favor of runFieldGeneration with lorebook ID
  getItemGenerationState: (itemId: string) => {
    isRunning: boolean;
    isQueued?: boolean;
    budgetState?: "normal" | "waiting_for_user" | "waiting_for_timer";
    budgetResolver?: () => void;
    budgetTimeRemaining?: number;
  } | undefined;
  // Field/Lorebook Generation
  runFieldGeneration?: (fieldId: string) => void;
  cancelFieldGeneration?: (fieldId: string) => void;
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
      agentWorkflowService,
      getItemEditMode,
      toggleItemEditMode,
      runListGeneration,
      getListGenerationState,
      cancelListGeneration,
      runFieldGeneration,
      cancelFieldGeneration,
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
      // Ensure linked lorebook exists (create on fly if missing logic handled elsewhere or assumed)
      let linkedId = item.linkedLorebooks[0];
      if (!linkedId) {
        // Trigger sync if missing
        storyManager.updateDulfsItem(config.id, item.id, {}, "none", true);
      }

      const sessionId = linkedId ? `lorebook:${linkedId}` : undefined;
      const session = sessionId
        ? agentWorkflowService.getSession(sessionId)
        : undefined;

      const isEditing = getItemEditMode ? getItemEditMode(item.id) : false;
      const isItemGenerating = session?.isRunning || false;

      // Determine Status Icon
      // Logic:
      // - If no linkedId: Warning (Unlinked)
      // - If linkedId && hasContent: Check/Book (Ready)
      // - If linkedId && !hasContent: Circle/BookOpen (Empty)
      let statusIcon: IconId = "alertTriangle";
      let statusColor = "orange";
      let statusTitle = "Unlinked / Syncing...";

      const hasContent = !!(
        item.lorebookContent && item.lorebookContent.length > 0
      );

      if (linkedId) {
        if (hasContent) {
          statusIcon = "bookOpen"; // Or 'file-text' or 'check-circle'
          statusColor = "green";
          statusTitle = "Lorebook Entry Generated";
        } else {
          statusIcon = "book"; // Or 'circle'
          statusColor = "gray";
          statusTitle = "Lorebook Entry Empty";
        }
      }

      const statusIndicator = button({
        iconId: statusIcon,
        text: "", // Icon only
        style: {
          color: statusColor,
          padding: "4px",
          width: "24px",
          border: "none",
          background: "transparent",
        },
        callback: () => {
          // Maybe show a toast with statusTitle?
          api.v1.ui.toast(statusTitle);
        },
      });

      const toggle = () => {
        if (toggleItemEditMode) {
          if (isEditing) {
            // Saving is handled by onChange in the input
          }
          toggleItemEditMode(item.id);
        }
      };

      // Item Name Display/Input
      let namePart: UIPart;
      if (isEditing) {
        namePart = textInput({
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
        });
      } else {
        namePart = text({
          text: item.name || "Unnamed",
          style: {
            "font-weight": "bold",
            "flex-grow": "1",
            "padding-left": "4px",
            "align-self": "center",
          },
        });
      }

      // Item Generation Button (Bolt)
      const genButton = createResponsiveGenerateButton(
        `item-gen-btn-${item.id}`,
        {
          isRunning: isItemGenerating,
          isQueued: session?.isQueued,
          budgetState: session?.budgetState,
          budgetTimeRemaining: session?.budgetTimeRemaining,
        },
        {
          onStart: () => {
            if (linkedId && runFieldGeneration) {
              runFieldGeneration(`lorebook:${linkedId}`);
            } else {
              api.v1.ui.toast(
                "No linked lorebook entry found. Try waiting a moment.",
                { type: "warning" },
              );
            }
          },
          onCancel: () => {
            if (linkedId && cancelFieldGeneration) {
              cancelFieldGeneration(`lorebook:${linkedId}`);
            }
          },
          onContinue: () => {
            if (session?.budgetResolver) session.budgetResolver();
          },
        },
        "", // No text, just icon
      );

      return row({
        style: {
          "margin-bottom": "4px",
          border: "1px solid rgba(128, 128, 128, 0.1)",
          "border-radius": "4px",
          padding: "2px 4px",
          "align-items": "center",
          gap: "4px",
        },
        content: [
          statusIndicator,
          namePart,
          genButton,
          button({
            iconId: isEditing ? "save" : "edit-3",
            callback: toggle,
            style: { width: "24px", padding: "4px" },
          }),
          button({
            iconId: "trash",
            callback: () => {
              storyManager.removeDulfsItem(config.id, item.id);
            },
            style: { width: "24px", padding: "4px" },
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
