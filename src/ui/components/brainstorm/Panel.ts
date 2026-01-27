import { RootState } from "../../../core/store/types";
import { IDS } from "../../framework/ids";
import { Input } from "./Input";
import { List } from "./List";

const { column } = api.v1.ui.part;
const { sidebarPanel } = api.v1.ui.extension;

export function describeBrainstormPanel(
  state: RootState,
): UIExtensionSidebarPanel {
  const listPart = List.describe({
    initialMessages: state.brainstorm.messages,
  });
  const inputPart = Input.describe({});

  return sidebarPanel({
    id: "kse-brainstorm-sidebar",
    name: "Brainstorm",
    iconId: "cloud-lightning",
    content: [
      column({
        id: IDS.BRAINSTORM.ROOT,
        style: { height: "100%", "justify-content": "space-between" },
        content: [listPart, inputPart],
      }),
    ],
  });
}
