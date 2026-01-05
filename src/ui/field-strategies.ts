import { FieldConfig, FieldID } from "../config/field-definitions";
import { StoryManager, DULFSField } from "../core/story-manager";
import { AgentCycleManager, FieldSession } from "../core/agent-cycle";
import { WandUI } from "./wand-ui";
import {
  createHeaderWithToggle,
  createToggleableContent,
  createResponsiveGenerateButton
} from "./ui-components";

const { row, column, text, multilineTextInput, button } = api.v1.ui.part;

export interface RenderContext {
  config: FieldConfig;
  storyManager: StoryManager;
  agentCycleManager: AgentCycleManager;
  wandUI: WandUI;
  editModeState: boolean; // The specific boolean for this field/mode
  toggleEditMode: () => void;
  handleFieldChange: (content: string) => void;
  handleWandClick: () => void;
  saveWandResult: (session: FieldSession) => void;
  // List-specific
  getItemEditMode?: (itemId: string) => boolean;
  toggleItemEditMode?: (itemId: string) => void;
  runListGeneration?: () => Promise<void>;
  getListGenerationState?: () => { isRunning: boolean; signal?: any };
  cancelListGeneration?: () => void;
}

export interface FieldRenderStrategy {
  getTitle(context: RenderContext): string;
  renderContent(context: RenderContext): UIPart[];
}

// --- Helper for Action Buttons ---
function createFieldActions(_context: RenderContext): UIPart {
  // Currently, no standard fields trigger the Wand via a button.
  // The logic is reserved for future expansion (e.g. enabling Modal Wand for DULFS).
  return row({ content: [] });
}

// --- Strategies ---

export class ListFieldStrategy implements FieldRenderStrategy {
  getTitle(context: RenderContext): string {
    return context.config.label;
  }

  renderContent(context: RenderContext): UIPart[] {
    const {
      config,
      storyManager,
      getItemEditMode,
      toggleItemEditMode,
      runListGeneration,
      getListGenerationState,
      cancelListGeneration
    } = context;

    const list = storyManager.getDulfsList(config.id);
    const genState = getListGenerationState ? getListGenerationState() : { isRunning: false };

    // --- Actions Row ---
    const actionsRow = row({
      style: { "margin-bottom": "12px", gap: "8px", "align-items": "center" },
      content: [
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
                }
            },
            "Generate"
        )
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
                `story:kse-field-${config.id}-${item.id}`,
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

export class StoryPromptStrategy implements FieldRenderStrategy {
  getTitle(context: RenderContext): string {
    return context.config.label;
  }

  renderContent(context: RenderContext): UIPart[] {
    const { config, storyManager, handleFieldChange } = context;
    const content = storyManager.getFieldContent(config.id);

    return [
      text({
        text: config.description,
        style: {
          "font-style": "italic",
          opacity: "0.8",
          "margin-bottom": "8px",
        },
      }),
      multilineTextInput({
        placeholder: config.placeholder,
        initialValue: content,
        storageKey: `story:kse-field-${config.id}`,
        onChange: (newContent: string) => handleFieldChange(newContent),
      }),
      createFieldActions(context),
    ];
  }
}

export class InlineWandStrategy implements FieldRenderStrategy {
  getTitle(context: RenderContext): string {
    return context.config.label;
  }

  renderContent(context: RenderContext): UIPart[] {
    const {
      config,
      storyManager,
      agentCycleManager,
      wandUI,
      editModeState,
      toggleEditMode,
    } = context;

    // Ensure session exists (Inline Wand specific logic)
    let session = agentCycleManager.getSession(config.id);
    if (!session) {
      session = agentCycleManager.startSession(config.id);
    }

    return [
      createHeaderWithToggle(config.description, editModeState, toggleEditMode),
      createToggleableContent(
        editModeState,
        storyManager.getFieldContent(config.id),
        config.placeholder,
        `story:kse-field-${config.id}`,
        (val) => {
          if (session) {
            // Update active stage content to keep in sync
            const activeStage = session.selectedStage;
            if (session.cycles[activeStage]) {
              session.cycles[activeStage].content = val;
            }
            // Live save to StoryManager
            storyManager.setFieldContent(config.id, val, false);
          }
        },
      ),
      wandUI.createInlineControlCluster(session, config.id),
    ];
  }
}

export class StandardFieldStrategy implements FieldRenderStrategy {
  getTitle(context: RenderContext): string {
    return context.config.label;
  }

  renderContent(context: RenderContext): UIPart[] {
    const {
      config,
      storyManager,
      editModeState,
      toggleEditMode,
      handleFieldChange,
    } = context;

    const content = storyManager.getFieldContent(config.id);

    return [
      createHeaderWithToggle(config.description, editModeState, toggleEditMode),
      createToggleableContent(
        editModeState,
        content,
        config.placeholder,
        `story:kse-field-${config.id}`,
        (newContent: string) => handleFieldChange(newContent),
      ),
      createFieldActions(context),
    ];
  }
}

// --- Factory ---

export function getFieldStrategy(config: FieldConfig): FieldRenderStrategy {
  if (config.id === FieldID.StoryPrompt) {
    return new StoryPromptStrategy();
  }

  if (config.layout === "inline-wand") {
    return new InlineWandStrategy();
  }

  if (config.layout === "list") {
    return new ListFieldStrategy();
  }

  return new StandardFieldStrategy();
}
