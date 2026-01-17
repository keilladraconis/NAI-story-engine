import { RootState } from "../../core/store/types";
import { Dispatch } from "../../core/store";
import { FIELD_CONFIGS } from "../../config/field-definitions";
import {
  segaToggled,
  settingUpdated,
  storyCleared,
  uiClearConfirmToggled,
} from "../../core/store/actions";
import { renderField } from "./fields";

const { row, column, text, button, textInput } = api.v1.ui.part;
const { sidebarPanel } = api.v1.ui.extension;

export const renderMainSidebar = (
  state: RootState,
  dispatch: Dispatch,
): UIExtensionSidebarPanel => {
  const isSegaRunning = state.runtime.segaRunning;
  const showClearConfirm = state.ui.showClearConfirm;

  const headerContent: UIPart[] = [
    text({ text: "🎭 Story Engine", style: { "font-weight": "bold" } }),
    button({
      text: "S.E.G.A.",
      iconId: isSegaRunning ? "fast-forward" : "play-circle",
      style: {
        padding: "4px 8px",
        "font-size": "0.8em",
        color: isSegaRunning ? "#ff9800" : undefined,
      },
      callback: () => dispatch(segaToggled()),
    }),
  ];

  if (showClearConfirm) {
    headerContent.push(
      row({
        style: { gap: "8px", "align-items": "center" },
        content: [
          text({
            text: "Clear?",
            style: { color: "red", "font-weight": "bold" },
          }),
          button({
            text: "Yes",
            style: { color: "red", padding: "2px 8px" },
            callback: () => {
              dispatch(storyCleared());
              dispatch(uiClearConfirmToggled());
            },
          }),
          button({
            text: "No",
            style: { padding: "2px 8px" },
            callback: () => dispatch(uiClearConfirmToggled()),
          }),
        ],
      }),
    );
  } else {
    headerContent.push(
      button({
        text: "Clear",
        iconId: "trash-2",
        style: { padding: "4px 8px", opacity: 0.7 },
        callback: () => dispatch(uiClearConfirmToggled()),
      }),
    );
  }

  const settingPart = row({
    style: { "align-items": "center", gap: "8px", "margin-bottom": "8px" },
    content: [
      text({
        text: "Setting:",
        style: { "font-weight": "bold", opacity: 0.8 },
      }),
      textInput({
        initialValue: state.story.setting,
        placeholder: "Original, Star Wars...",
        style: { flex: 1 },
        onChange: (val) => dispatch(settingUpdated({ setting: val })),
      }),
    ],
  });

  const fieldSections = FIELD_CONFIGS.filter((c) => !c.hidden).map((c) =>
    renderField(c, state, dispatch),
  );

  return sidebarPanel({
    id: "kse-sidebar",
    name: "Story Engine",
    iconId: "lightning",
    content: [
      column({
        content: [
          row({
            style: {
              "justify-content": "space-between",
              "margin-bottom": "8px",
            },
            content: headerContent,
          }),
          settingPart,
          column({ style: { gap: "8px" }, content: fieldSections }),
        ],
      }),
    ],
  });
};
