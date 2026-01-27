import { Component } from "../../../../lib/nai-act";
import { RootState } from "../../../core/store/types";
import { Header } from "./Header";
import { SettingField } from "./SettingField";
import { FieldList } from "./FieldList";

const { column } = api.v1.ui.part;
const { sidebarPanel } = api.v1.ui.extension;

export const Sidebar: Component<{}, RootState> = {
  id: () => "kse-sidebar",

  describe(props, state) {
    return sidebarPanel({
      id: "kse-sidebar",
      name: "Story Engine",
      iconId: "lightning",
      content: [
        column({
          content: [
            Header.describe(props, state) as UIPart,
            SettingField.describe(props, state) as UIPart,
            FieldList.describe(props, state) as UIPart,
          ],
        }),
      ],
    });
  },

  bind(tools, props) {
    Header.bind(tools, props);
    SettingField.bind(tools, props);
    FieldList.bind(tools, props);
  },
};
