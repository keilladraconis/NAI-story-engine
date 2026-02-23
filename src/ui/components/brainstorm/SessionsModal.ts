import { BindContext } from "nai-act";
import { chatSwitched, chatDeleted, chatRenamed } from "../../../core/store/slices/brainstorm";
import { RootState } from "../../../core/store/types";
import { ButtonWithConfirmation } from "../ButtonWithConfirmation";
import { EditableText } from "../EditableText";
import { IDS } from "../../framework/ids";

const { text, column, button } = api.v1.ui.part;

const ACTION_BTN_STYLE = { width: "24px", padding: "4px", "flex-shrink": "0" };

type Modal = {
  update: (options: { content: UIPart[] }) => Promise<void>;
  close: () => Promise<void>;
  closed: Promise<void>;
};

function buildSessionRows(
  ctx: BindContext<RootState>,
  modal: Modal,
  cleanups: (() => void)[],
) {
  const { chats, currentChatIndex } = ctx.getState().brainstorm;

  return chats.map((chat, index) => {
    const isCurrent = index === currentChatIndex;
    const canDelete = chats.length > 1;
    const rowId = IDS.BRAINSTORM.sessionRow(index);

    // Action buttons passed as extraControls to EditableText
    const controls: UIPart[] = [
      button({
        id: `${rowId}-load`,
        iconId: "folder",
        style: ACTION_BTN_STYLE,
        callback: () => {
          ctx.dispatch(chatSwitched(index));
          modal.close();
        },
      }),
    ];

    if (canDelete) {
      const { part, unmount } = ctx.render(ButtonWithConfirmation, {
        id: `${rowId}-del`,
        label: "",
        confirmLabel: "Delete?",
        iconId: "trash" as IconId,
        buttonStyle: { ...ACTION_BTN_STYLE, opacity: "0.5" },
        onConfirm: () => {
          ctx.dispatch(chatDeleted(index));
          rebuildModal(ctx, modal, cleanups);
        },
      });
      cleanups.push(unmount);
      controls.push(part);
    }

    const { part: titleRow, unmount: unmountTitle } = ctx.render(EditableText, {
      id: `${rowId}-title`,
      getContent: () => ctx.getState().brainstorm.chats[index]?.title ?? "",
      placeholder: "Session title...",
      singleLine: true,
      initialDisplay: chat.title,
      extraControls: controls,
      onSave: (title: string) => {
        ctx.dispatch(chatRenamed({ index, title: title.trim() || chat.title }));
        rebuildModal(ctx, modal, cleanups);
      },
    });
    cleanups.push(unmountTitle);

    // EditableText singleLine returns a row — wrap it to add per-row styling
    return column({
      id: rowId,
      style: {
        padding: "6px 8px",
        "border-bottom": "1px solid rgba(255, 255, 255, 0.05)",
        "background-color": isCurrent ? "rgba(64, 156, 255, 0.15)" : "transparent",
      },
      content: [titleRow],
    });
  });
}

function rebuildModal(
  ctx: BindContext<RootState>,
  modal: Modal,
  cleanups: (() => void)[],
) {
  // Unmount previous mounted component instances
  cleanups.forEach((fn) => fn());
  cleanups.length = 0;

  modal.update({
    content: [
      text({
        text: "_The active session is included as Story Engine context._",
        markdown: true,
        style: { "font-size": "0.8em", opacity: "0.6", padding: "4px 8px" },
      }),
      column({
        style: { gap: "2px" },
        content: buildSessionRows(ctx, modal, cleanups),
      }),
    ],
  });
}

export async function openSessionsModal(ctx: BindContext<RootState>): Promise<void> {
  const cleanups: (() => void)[] = [];

  const modal = await api.v1.ui.modal.open({
    title: "Brainstorm Sessions",
    size: "small",
    content: [],
  });

  rebuildModal(ctx, modal, cleanups);

  // Clean up mounted components when modal closes
  modal.closed.then(() => {
    cleanups.forEach((fn) => fn());
    cleanups.length = 0;
  });
}
