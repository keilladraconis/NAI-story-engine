import { Header } from "./Header";
import { SettingField } from "./SettingField";
import { FieldList } from "./FieldList";

const { column } = api.v1.ui.part;
const { sidebarPanel } = api.v1.ui.extension;

export const Sidebar: any = {
  id: () => "kse-sidebar",
  events: undefined,

  describe(props: any) {
    return sidebarPanel({
      id: "kse-sidebar",
      name: "Story Engine",
      iconId: "lightning",
      content: [
        column({
          content: [
            Header.describe(props),
            SettingField.describe(props),
            FieldList.describe(props),
          ],
        }),
      ],
    });
  },

  onMount(props: any, ctx: any) {
    ctx.mount(Header, props);
    ctx.mount(SettingField, props);
    ctx.mount(FieldList, props);
  },
};
