import { Component, createEvents } from "../../../../lib/nai-act";
import { RootState } from "../../../core/store/types";
import { FieldConfig } from "../../../config/field-definitions";
import {
  fieldUpdated,
  uiEditModeToggled,
  uiInputChanged,
} from "../../../core/store/actions";
import { GenerationButton } from "../GenerationButton";

export interface TextFieldProps {
  config: FieldConfig;
}

const { collapsibleSection, row, text, button, multilineTextInput } = api.v1.ui.part;

const events = createEvents({
  toggleEdit: (props: TextFieldProps, content: string, draft: string, isEditing: boolean) => {
    if (isEditing) {
      fieldUpdated({ fieldId: props.config.id, content: draft });
    } else {
      uiInputChanged({ id: `field-draft-${props.config.id}`, value: content });
    }
    uiEditModeToggled({ id: props.config.id });
  },
  inputChange: (props: TextFieldProps, val: string) => {
    uiInputChanged({ id: `field-draft-${props.config.id}`, value: val });
  },
});

export const TextField: Component<TextFieldProps, RootState> = {
  id: (props) => `section-${props.config.id}`,

  describe(props, state) {
    const { config } = props;
    if (!state) return collapsibleSection({ id: `section-${config.id}`, title: config.label, content: [] });

    const isEditing = state.ui.editModes[config.id] || false;
    const content = state.story.fields[config.id]?.content || "";
    const draftKey = `field-draft-${config.id}`;
    const draft = state.ui.inputs[draftKey] !== undefined ? state.ui.inputs[draftKey] : content;

    const requestId = `gen-${config.id}`;

    // Generation Button
    // Note: Callbacks will be bound in bind() via GenerationButton.bind() or manually if dispatch is available
    const genButton = GenerationButton.describe({
        id: `gen-btn-${config.id}`,
        requestId,
        request: {
            id: requestId,
            type: "field",
            targetId: config.id
        },
        label: "Generate"
    }, state) as UIPart;

    const toggleBtnId = `toggle-btn-${config.id}`;
    const headerRow = row({
        id: `header-row-${config.id}`,
        style: {
          "justify-content": "space-between",
          "align-items": "center",
          "margin-bottom": "8px",
          "flex-wrap": "wrap",
          gap: "4px",
        },
        content: [
          text({
            text: config.description,
            style: { "font-style": "italic", opacity: "0.8", "flex-shrink": "1" },
          }),
          row({
            style: { gap: "4px", "flex-wrap": "wrap" },
            content: [
                button({
                  id: toggleBtnId,
                  text: isEditing ? "Save" : "Edit",
                  iconId: isEditing ? "save" : "edit-3",
                  callback: () => events.toggleEdit(props, content, draft, isEditing),
                  style: { padding: "4px 8px" },
                }),
                genButton
            ],
          }),
        ],
    });

    const inputDisplay = isEditing ? "block" : "none";
    const textDisplay = isEditing ? "none" : "block";

    // Text Display
    const processedContent = (content || "_No content._").replace(/\n/g, "  \n").replace(/\[/g, "\\[");
    const textPart = text({
      id: `text-display-${config.id}`, 
      text: processedContent,
      markdown: true,
      style: {
        padding: "8px",
        border: "1px solid rgba(128, 128, 128, 0.2)",
        "border-radius": "4px",
        "min-height": "100px",
        "user-select": "text",
        display: textDisplay
      },
    });

    // Input Part
    const inputPart = multilineTextInput({
      id: `input-${config.id}`,
      placeholder: config.placeholder,
      initialValue: draft,
      storageKey: `story:draft-${config.id}`, 
      onChange: (val) => events.inputChange(props, val),
      style: {
        "min-height": "100px",
        display: inputDisplay
      },
    });

    return collapsibleSection({
      id: `section-${config.id}`,
      title: config.label,
      iconId: config.icon,
      storageKey: `story:kse-section-${config.id}`,
      content: [
        headerRow,
        inputPart,
        textPart
      ]
    });
  },

  bind(ctx, props) {
      const { useSelector, updateParts } = ctx;
      const { config } = props;
      const requestId = `gen-${config.id}`;
      
      // Bind Generation Button
      GenerationButton.bind(ctx, {
          id: `gen-btn-${config.id}`,
          requestId,
          request: {
              id: requestId,
              type: "field",
              targetId: config.id
          },
          label: "Generate"
      });
      
      // Update toggle button callback with latest state
      // Since toggleEdit needs 'content', 'draft', 'isEditing'
      // We can't update the callback easily without recreating the button or using a ref.
      // BUT 'events.toggleEdit' receives 'props'. 
      // The other args (content, draft, isEditing) were passed from describe.
      // If we use closures in 'describe', they are stale in 'bind'.
      // Correct pattern: The event handler should read from STATE?
      // Or we pass the values in the callback update.
      
      // Actually, createEvents just calls the handler.
      // If we update the button callback in bind, we can close over the new state.
      
      useSelector(
          state => ({
              editMode: state.ui.editModes[config.id],
              content: state.story.fields[config.id]?.content,
              draft: state.ui.inputs[`field-draft-${config.id}`],
          }),
          (slice) => {
             const isEditing = !!slice.editMode;
             const content = slice.content || "";
             const draft = slice.draft !== undefined ? slice.draft : content;
             
             updateParts([
                 { 
                     id: `toggle-btn-${config.id}`, 
                     text: isEditing ? "Save" : "Edit", 
                     iconId: isEditing ? "save" : "edit-3",
                     callback: () => events.toggleEdit(props, content, draft, isEditing)
                 },
                 { 
                     id: `input-${config.id}`,
                     style: { display: isEditing ? "block" : "none" } 
                 },
                 { 
                     id: `text-display-${config.id}`,
                     style: { display: isEditing ? "none" : "block" },
                     text: (content || "_No content._").replace(/\n/g, "  \n").replace(/\[/g, "\\[")
                 }
             ]);
          }
      );
  }
};
