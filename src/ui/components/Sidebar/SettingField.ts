import { Component, createEvents } from "../../../../lib/nai-act";
import { RootState } from "../../../core/store/types";
import { settingUpdated } from "../../../core/store/slices/story";

const { row, text, button, textInput } = api.v1.ui.part;

type SettingEvents = {
  toggleMode(isEditing: boolean, currentDraft: string, dispatch: any): void;
  save(val: string, dispatch: any): void;
  handleInput(val: string): void;
};

const events = createEvents<{}, SettingEvents>();

export const SettingField: Component<{}, RootState> = {
  id: () => "kse-sidebar-setting",
  events: undefined,

  describe(props) {
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
          style: { flex: 1, display: "none" },
          onChange: (val) => events.handleInput(props, val),
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
          callback: () => events.toggleMode(props, true, "", null),
        }),
        button({
          id: "kse-setting-save-btn",
          iconId: "save",
          style: { width: "24px", padding: "4px", display: "none" },
          callback: () => events.toggleMode(props, false, "", null),
        }),
      ],
    });
  },

  onMount(props, ctx) {
    const { useSelector } = ctx;
    let currentDraft = "";

    events.attach({
      toggleMode: (_p, isEditing, _, d) => {
        api.v1.ui.updateParts([
          {
            id: "kse-setting-input",
            style: { display: isEditing ? "block" : "none" },
          },
          {
            id: "kse-setting-text",
            style: { display: isEditing ? "none" : "block" },
          },
          {
            id: "kse-setting-edit-btn",
            style: { display: isEditing ? "none" : "block" },
          },
          {
            id: "kse-setting-save-btn",
            style: { display: isEditing ? "block" : "none" },
          },
        ]);
        if (!isEditing) {
          events.save(props, currentDraft, d);
        }
      },
      save: (_p, val, d) => d(settingUpdated(val)),
      handleInput: (_p, val) => {
        currentDraft = val;
      },
    });

    useSelector(
      (state) => state.story.setting,
      (setting) => {
        const safeSetting = setting || "Original";
        if (!currentDraft) currentDraft = safeSetting;
        api.v1.ui.updateParts([
          { id: "kse-setting-text", text: safeSetting },
          { id: "kse-setting-input", initialValue: safeSetting },
        ]);
      },
    );
  },
};
