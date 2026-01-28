import { BindContext, createEvents, defineComponent } from "../../../../lib/nai-act";
import { RootState } from "../../../core/store/types";
import { settingUpdated } from "../../../core/store/slices/story";
import {
  uiFieldEditBegin,
  uiFieldEditEnd,
} from "../../../core/store/slices/ui";

const { row, text, button, textInput } = api.v1.ui.part;

const FIELD_ID = "kse-setting";
const STORAGE_KEY = "kse-setting-draft";

type SettingEvents = {
  beginEdit(): void;
  save(): void;
};

export const SettingField = defineComponent({
  id: () => "kse-sidebar-setting",
  events: createEvents<{}, SettingEvents>(),

  describe(_props: {}) {
    return row({
      id: "kse-sidebar-setting",
      style: { "align-items": "center", gap: "8px", "margin-bottom": "8px" },
      content: [
        text({
          text: "Setting:",
          style: { "font-weight": "bold", opacity: 0.8 },
        }),
        textInput({
          id: "kse-setting-input",
          initialValue: "",
          placeholder: "Original, Star Wars...",
          storageKey: `story:${STORAGE_KEY}`,
          style: { flex: 1, display: "none" },
        }),
        text({
          id: "kse-setting-text",
          text: "Original",
          style: { flex: 1 },
        }),
        button({
          id: "kse-setting-edit-btn",
          iconId: "edit-3",
          style: { width: "24px", padding: "4px" },
          callback: () => this.events.beginEdit({}),
        }),
        button({
          id: "kse-setting-save-btn",
          iconId: "save",
          style: { width: "24px", padding: "4px", display: "none" },
          callback: () => this.events.save({}),
        }),
      ],
    });
  },

  onMount(_props: {}, ctx: BindContext<RootState>) {
    const { useSelector, useEffect, dispatch } = ctx;

    // Event handlers only dispatch intents
    this.events.attach({
      beginEdit: () => {
        dispatch(uiFieldEditBegin({ id: FIELD_ID }));
      },
      save: () => {
        dispatch(uiFieldEditEnd({ id: FIELD_ID }));
      },
    });

    type FieldAction = { type: string; payload: { id: string } };

    // Effect: Handle edit begin - push current content to storage
    useEffect(
      (action) =>
        action.type === uiFieldEditBegin({ id: "" }).type &&
        (action as FieldAction).payload.id === FIELD_ID,
      async (_action, { getState }) => {
        const setting = getState().story.setting || "Original";
        await api.v1.storyStorage.set(STORAGE_KEY, setting);
      },
    );

    // Effect: Handle save - read from storage and update state
    useEffect(
      (action) =>
        action.type === uiFieldEditEnd({ id: "" }).type &&
        (action as FieldAction).payload.id === FIELD_ID,
      async (_action, { dispatch }) => {
        const val = (await api.v1.storyStorage.get(STORAGE_KEY)) || "";
        dispatch(settingUpdated(String(val)));
      },
    );

    // React to Edit Mode
    useSelector(
      (state) => state.ui.editModes[FIELD_ID],
      (isEditing) => {
        api.v1.ui.updateParts([
          { id: "kse-setting-input", style: { display: isEditing ? "block" : "none" } },
          { id: "kse-setting-text", style: { display: isEditing ? "none" : "block" } },
          { id: "kse-setting-edit-btn", style: { display: isEditing ? "none" : "block" } },
          { id: "kse-setting-save-btn", style: { display: isEditing ? "block" : "none" } },
        ]);
      },
    );

    // Sync State -> Display
    useSelector(
      (state) => state.story.setting,
      (setting) => {
        const safeSetting = setting || "Original";
        api.v1.ui.updateParts([{ id: "kse-setting-text", text: safeSetting }]);
      },
    );
  },
});
