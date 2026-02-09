import { defineComponent } from "../../../../lib/nai-act";

const { row, text, textInput } = api.v1.ui.part;

export const SettingField = defineComponent({
  id: () => "kse-sidebar-setting",

  build(_props: {}) {
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
          initialValue: "original",
          placeholder: "Original, Star Wars...",
          storageKey: "story:kse-setting",
          style: { flex: 1 },
        }),
      ],
    });
  },
});
