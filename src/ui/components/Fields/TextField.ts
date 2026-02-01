import { createEvents, defineComponent } from "../../../../lib/nai-act";
import { RootState } from "../../../core/store/types";
import { FieldConfig, FieldID } from "../../../config/field-definitions";
import { fieldUpdated } from "../../../core/store/slices/story";
import {
  uiFieldEditBegin,
  uiFieldEditEnd,
} from "../../../core/store/slices/ui";
import { uiGenerationRequested } from "../../../core/store/slices/runtime";
import { GenerationButton } from "../GenerationButton";

export type TextFieldProps = FieldConfig;

const {
  text,
  row,
  button,
  collapsibleSection,
  multilineTextInput,
  checkboxInput,
} = api.v1.ui.part;

type TextFieldEvents = {
  beginEdit(): void;
  save(): void;
};

// Fields that use plain textarea mode (no edit/save modality)
const PLAIN_TEXT_FIELDS = [FieldID.ATTG, FieldID.Style];

export const TextField = defineComponent<
  TextFieldProps,
  RootState,
  ReturnType<typeof createEvents<TextFieldProps, TextFieldEvents>>
>({
  id: (config) => `section-${config.id}`,
  events: createEvents<TextFieldProps, TextFieldEvents>(),

  styles: {
    textArea: { "min-height": "100px" },
    textDisplay: {
      padding: "8px",
      border: "1px solid rgba(128, 128, 128, 0.2)",
      "border-radius": "4px",
      "min-height": "100px",
      "user-select": "text",
    },
    headerRow: {
      "justify-content": "space-between",
      "align-items": "center",
      "margin-bottom": "8px",
      "flex-wrap": "wrap",
      gap: "4px",
    },
    descriptionText: {
      "font-style": "italic",
      opacity: "0.8",
      "flex-shrink": "1",
    },
    buttonGroup: { gap: "4px", "flex-wrap": "wrap" },
    standardButton: { padding: "4px 8px" },
    hidden: { display: "none" },
    visible: { display: "block" },
    checkboxRow: {
      "margin-top": "8px",
      "padding-top": "8px",
      "border-top": "1px solid rgba(128, 128, 128, 0.2)",
    },
  },

  describe(config) {
    const requestId = `gen-${config.id}`;
    const isPlainTextField = PLAIN_TEXT_FIELDS.includes(config.id as FieldID);

    const genButton = GenerationButton.describe({
      id: `gen-btn-${config.id}`,
      requestId,
      label: "Generate",
      generateAction: uiGenerationRequested({
        id: requestId,
        type: "field",
        targetId: config.id,
      }),
    }) as UIPart;

    // Plain text fields (ATTG, Style) - always editable textarea
    if (isPlainTextField) {
      const header = row({
        id: `header-row-${config.id}`,
        style: this.style?.("headerRow"),
        content: [
          text({
            text: config.description,
            style: this.style?.("descriptionText"),
          }),
          row({
            style: this.style?.("buttonGroup"),
            content: [genButton],
          }),
        ],
      });

      // Build input with onChange for sync
      let inputPart: UIPart;
      if (config.id === FieldID.ATTG) {
        // ATTG syncs to Memory
        inputPart = multilineTextInput({
          id: `input-${config.id}`,
          placeholder: config.placeholder,
          initialValue: "",
          storageKey: `story:kse-field-${config.id}`,
          style: this.style?.("textArea"),
          onChange: async (value: string) => {
            const syncEnabled = await api.v1.storyStorage.get(
              "kse-sync-attg-memory",
            );
            if (syncEnabled) {
              await api.v1.memory.set(value);
            }
          },
        });
      } else if (config.id === FieldID.Style) {
        // Style syncs to Author's Note
        inputPart = multilineTextInput({
          id: `input-${config.id}`,
          placeholder: config.placeholder,
          initialValue: "",
          storageKey: `story:kse-field-${config.id}`,
          style: this.style?.("textArea"),
          onChange: async (value: string) => {
            const syncEnabled =
              await api.v1.storyStorage.get("kse-sync-style-an");
            if (syncEnabled) {
              await api.v1.an.set(value);
            }
          },
        });
      } else {
        inputPart = multilineTextInput({
          id: `input-${config.id}`,
          placeholder: config.placeholder,
          initialValue: "",
          storageKey: `story:kse-field-${config.id}`,
          style: this.style?.("textArea"),
        });
      }

      const content: UIPart[] = [header, inputPart];

      // Add sync checkbox for ATTG field (syncs to Memory)
      if (config.id === FieldID.ATTG) {
        content.push(
          row({
            style: this.style?.("checkboxRow"),
            content: [
              checkboxInput({
                id: `checkbox-sync-${config.id}`,
                initialValue: false,
                storageKey: "story:kse-sync-attg-memory",
                label: "Copy to Memory",
                onChange: async (checked: boolean) => {
                  if (checked) {
                    const content = await api.v1.storyStorage.get(
                      `kse-field-${config.id}`,
                    );
                    if (content) {
                      await api.v1.memory.set(String(content));
                    }
                  }
                },
              }),
            ],
          }),
        );
      }

      // Add sync checkbox for Style field (syncs to Author's Note)
      if (config.id === FieldID.Style) {
        content.push(
          row({
            style: this.style?.("checkboxRow"),
            content: [
              checkboxInput({
                id: `checkbox-sync-${config.id}`,
                initialValue: false,
                storageKey: "story:kse-sync-style-an",
                label: "Copy to Author's Note",
                onChange: async (checked: boolean) => {
                  if (checked) {
                    const content = await api.v1.storyStorage.get(
                      `kse-field-${config.id}`,
                    );
                    if (content) {
                      await api.v1.an.set(String(content));
                    }
                  }
                },
              }),
            ],
          }),
        );
      }

      return collapsibleSection({
        id: `section-${config.id}`,
        title: config.label,
        iconId: config.icon,
        storageKey: `story:kse-section-${config.id}`,
        content,
      });
    }

    // Standard fields with edit/save modality
    const toggleEditId = `btn-edit-${config.id}`;
    const toggleSaveId = `btn-save-${config.id}`;

    const header = row({
      id: `header-row-${config.id}`,
      style: this.style?.("headerRow"),
      content: [
        text({
          text: config.description,
          style: this.style?.("descriptionText"),
        }),
        row({
          style: this.style?.("buttonGroup"),
          content: [
            button({
              id: toggleEditId,
              text: "Edit",
              iconId: "edit-3",
              style: this.style?.("standardButton"),
              callback: () => this.events.beginEdit(config),
            }),
            button({
              id: toggleSaveId,
              text: "Save",
              iconId: "save",
              style: this.style?.("standardButton", "hidden"),
              callback: () => this.events.save(config),
            }),
            genButton,
          ],
        }),
      ],
    });

    const content: UIPart[] = [
      header,
      multilineTextInput({
        id: `input-${config.id}`,
        placeholder: config.placeholder,
        initialValue: "",
        storageKey: `story:draft-${config.id}`,
        style: this.style?.("textArea", "hidden"),
      }),
      text({
        id: `text-display-${config.id}`,
        text: "_No content._",
        markdown: true,
        style: this.style?.("textDisplay"),
      }),
    ];

    return collapsibleSection({
      id: `section-${config.id}`,
      title: config.label,
      iconId: config.icon,
      storageKey: `story:kse-section-${config.id}`,
      content,
    });
  },

  onMount(config, ctx) {
    const { useSelector, useEffect, dispatch } = ctx;
    const isPlainTextField = PLAIN_TEXT_FIELDS.includes(config.id as FieldID);

    // Bind Generation Button
    ctx.mount(GenerationButton, {
      id: `gen-btn-${config.id}`,
      requestId: `gen-${config.id}`,
      label: "Generate",
      generateAction: uiGenerationRequested({
        id: `gen-${config.id}`,
        type: "field",
        targetId: config.id,
      }),
    });

    // Plain text fields don't need edit/save modality
    if (isPlainTextField) {
      return;
    }

    // Standard field logic below
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
        dispatch(
          fieldUpdated({ fieldId: config.id, content: String(content) }),
        );
      },
    );

    // React to Edit Mode
    useSelector(
      (state) => state.ui.editModes[config.id],
      (isEditing) => {
        api.v1.ui.updateParts([
          {
            id: toggleEditId,
            style: this.style?.(
              "standardButton",
              isEditing ? "hidden" : "visible",
            ),
          },
          {
            id: toggleSaveId,
            style: this.style?.(
              "standardButton",
              isEditing ? "visible" : "hidden",
            ),
          },
          {
            id: inputId,
            style: this.style?.("textArea", isEditing ? "visible" : "hidden"),
          },
          {
            id: textId,
            style: this.style?.(
              "textDisplay",
              isEditing ? "hidden" : "visible",
            ),
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
