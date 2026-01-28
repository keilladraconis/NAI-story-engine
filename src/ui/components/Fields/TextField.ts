import {
  createEvents,
  mergeStyles,
  defineComponent,
} from "../../../../lib/nai-act";
import { RootState } from "../../../core/store/types";
import { FieldConfig } from "../../../config/field-definitions";
import { fieldUpdated } from "../../../core/store/slices/story";
import {
  uiFieldEditBegin,
  uiFieldEditEnd,
} from "../../../core/store/slices/ui";
import { generationRequested } from "../../../core/store/slices/runtime";
import { GenerationButton } from "../GenerationButton";
import {
  StyledCollapsibleSection,
  FieldHeaderRow,
  StandardButton,
  StyledTextArea,
  Styles,
} from "../../styles";

export type TextFieldProps = FieldConfig;

const { text, row } = api.v1.ui.part;

// Helper to create the header row
const createHeader = (
  config: FieldConfig,
  toggleEditId: string,
  toggleSaveId: string,
  genButton: UIPart,
  onToggleEdit: () => void,
  onSave: () => void,
) => {
  return FieldHeaderRow({
    id: `header-row-${config.id}`,
    content: [
      text({
        text: config.description,
        style: { "font-style": "italic", opacity: "0.8", "flex-shrink": "1" },
      }),
      row({
        style: { gap: "4px", "flex-wrap": "wrap" },
        content: [
          StandardButton({
            id: toggleEditId,
            text: "Edit",
            iconId: "edit-3",
            callback: onToggleEdit,
          }),
          StandardButton({
            id: toggleSaveId,
            text: "Save",
            iconId: "save",
            style: { display: "none" },
            callback: onSave,
          }),
          genButton,
        ],
      }),
    ],
  });
};

type TextFieldEvents = {
  beginEdit(): void;
  save(): void;
};

export const TextField = defineComponent<
  TextFieldProps,
  RootState,
  ReturnType<typeof createEvents<TextFieldProps, TextFieldEvents>>
>({
  id: (config) => `section-${config.id}`,
  events: createEvents<TextFieldProps, TextFieldEvents>(),

  styles: {
    textArea: { "min-height": "100px", display: "none" },
    textDisplay: {
      padding: "8px",
      border: "1px solid rgba(128, 128, 128, 0.2)",
      "border-radius": "4px",
      "min-height": "100px",
      "user-select": "text",
    },
  },

  describe(config) {
    const requestId = `gen-${config.id}`;
    const toggleEditId = `btn-edit-${config.id}`;
    const toggleSaveId = `btn-save-${config.id}`;

    const genButton = GenerationButton.describe({
      id: `gen-btn-${config.id}`,
      requestId,
      label: "Generate",
    }) as UIPart;

    const header = createHeader(
      config,
      toggleEditId,
      toggleSaveId,
      genButton,
      () => this.events.beginEdit(config),
      () => this.events.save(config),
    );

    return StyledCollapsibleSection({
      id: `section-${config.id}`,
      title: config.label,
      iconId: config.icon,
      storageKey: `story:kse-section-${config.id}`,
      content: [
        header,
        StyledTextArea({
          id: `input-${config.id}`,
          placeholder: config.placeholder,
          initialValue: "",
          storageKey: `story:draft-${config.id}`,
          style: this.styles?.textArea,
        }),
        text({
          id: `text-display-${config.id}`,
          text: "_No content._",
          markdown: true,
          style: this.styles?.textDisplay,
        }),
      ],
    });
  },

  onMount(config, ctx) {
    const { useSelector, useEffect, dispatch } = ctx;
    const toggleEditId = `btn-edit-${config.id}`;
    const toggleSaveId = `btn-save-${config.id}`;
    const inputId = `input-${config.id}`;
    const textId = `text-display-${config.id}`;
    const storageKey = `draft-${config.id}`;

    // Event handlers only dispatch actions
    this.events.attach({
      beginEdit: (props) => {
        dispatch(uiFieldEditBegin({ id: props.id }));
      },
      save: (props) => {
        dispatch(uiFieldEditEnd({ id: props.id }));
      },
    });

    type FieldAction = { type: string; payload: { id: string } };

    // Effect: Handle edit begin - push current content to storage
    useEffect(
      (action) =>
        action.type === uiFieldEditBegin({ id: "" }).type &&
        (action as FieldAction).payload.id === config.id,
      async (_action, { getState }) => {
        const content = getState().story.fields[config.id]?.content || "";
        await api.v1.storyStorage.set(storageKey, content);
      },
    );

    // Effect: Handle edit end - read from storage and update state
    useEffect(
      (action) =>
        action.type === uiFieldEditEnd({ id: "" }).type &&
        (action as FieldAction).payload.id === config.id,
      async (_action, { dispatch }) => {
        const content = (await api.v1.storyStorage.get(storageKey)) || "";
        dispatch(fieldUpdated({ fieldId: config.id, content: String(content) }));
      },
    );

    // Bind Generation Button
    ctx.mount(GenerationButton, {
      id: `gen-btn-${config.id}`,
      requestId: `gen-${config.id}`,
      label: "Generate",
      generateAction: generationRequested({
        id: `gen-${config.id}`,
        type: "field",
        targetId: config.id,
      }),
    });

    // React to Edit Mode
    useSelector(
      (state) => state.ui.editModes[config.id],
      (isEditing) => {
        api.v1.ui.updateParts([
          {
            id: toggleEditId,
            style: mergeStyles(Styles.standardButton, {
              display: isEditing ? "none" : "block",
            }),
          },
          {
            id: toggleSaveId,
            style: mergeStyles(Styles.standardButton, {
              display: isEditing ? "block" : "none",
            }),
          },
          {
            id: inputId,
            style: mergeStyles(
              Styles.textArea,
              mergeStyles(this.styles?.textArea, {
                display: isEditing ? "block" : "none",
              }),
            ),
          },
          {
            id: textId,
            style: mergeStyles(this.styles?.textDisplay, {
              display: isEditing ? "none" : "block",
            }),
          },
        ]);
      },
    );

    // Sync State -> Display
    useSelector(
      (state) => state.story.fields[config.id]?.content,
      (content) => {
        const safeContent = content || "";
        api.v1.ui.updateParts([
          {
            id: textId,
            text: (safeContent || "_No content._")
              .replace(/\n/g, "  \n")
              .replace(/\</g, "\\<"),
          },
        ]);
      },
    );
  },
});
