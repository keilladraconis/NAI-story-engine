import { Component, createEvents } from "../../../../lib/nai-act";
import { RootState } from "../../../core/store/types";
import { settingUpdated } from "../../../core/store/actions";

const { row, text, textInput } = api.v1.ui.part;

const events = createEvents({
    update: (_props: {}, val: string) => settingUpdated({ setting: val })
});

export const SettingField: Component<{}, RootState> = {
    id: () => "kse-sidebar-setting",

    describe(_, state) {
        return row({
            id: "kse-sidebar-setting",
            style: { "align-items": "center", gap: "8px", "margin-bottom": "8px" },
            content: [
              text({
                text: "Setting:",
                style: { "font-weight": "bold", opacity: 0.8 },
              }),
              textInput({
                initialValue: state?.story?.setting || "",
                placeholder: "Original, Star Wars...",
                style: { flex: 1 },
                onChange: (val) => events.update({}, val),
              }),
            ],
        });
    },

    bind({ useSelector, updateParts }, props) {
        useSelector(
            state => state.story.setting,
            (setting) => {
                const partialState = { story: { setting } } as RootState;
                updateParts([SettingField.describe(props, partialState) as UIPart & { id: string }]);
            }
        );
    }
};
