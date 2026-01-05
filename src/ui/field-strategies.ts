import { FieldConfig, FieldID } from "../config/field-definitions";
import { StoryManager } from "../core/story-manager";
import { AgentCycleManager, FieldSession } from "../core/agent-cycle";
import { WandUI } from "./wand-ui";
import { createHeaderWithToggle, createToggleableContent } from "./ui-components";

const { row, text, multilineTextInput } = api.v1.ui.part;

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
      toggleEditMode 
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
      handleFieldChange 
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

export function getFieldStrategy(
  config: FieldConfig, 
): FieldRenderStrategy {
  if (config.id === FieldID.StoryPrompt) {
    return new StoryPromptStrategy();
  }

  if (config.layout === "inline-wand") {
    return new InlineWandStrategy();
  }

  return new StandardFieldStrategy();
}
