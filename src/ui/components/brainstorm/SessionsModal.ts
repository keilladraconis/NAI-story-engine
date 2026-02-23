import { BindContext } from "nai-act";
import { chatSwitched, chatDeleted } from "../../../core/store/slices/brainstorm";
import { RootState } from "../../../core/store/types";
import { ButtonWithConfirmation } from "../ButtonWithConfirmation";
import { IDS } from "../../framework/ids";

const { row, text, button, column } = api.v1.ui.part;

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

    const deleteContent: UIPart[] = [];
    if (canDelete) {
      const { part, unmount } = ctx.render(ButtonWithConfirmation, {
        id: `${IDS.BRAINSTORM.sessionRow(index)}-del`,
        label: "",
        confirmLabel: "Delete?",
        iconId: "trash" as IconId,
        buttonStyle: { width: "24px", padding: "4px", opacity: "0.5" },
        onConfirm: () => {
          ctx.dispatch(chatDeleted(index));
          rebuildModal(ctx, modal, cleanups);
        },
      });
      cleanups.push(unmount);
      deleteContent.push(part);
    }

    return row({
      id: IDS.BRAINSTORM.sessionRow(index),
      style: {
        padding: "8px",
        "align-items": "center",
        gap: "8px",
        "border-bottom": "1px solid rgba(255, 255, 255, 0.05)",
        "background-color": isCurrent ? "rgba(64, 156, 255, 0.15)" : "transparent",
      },
      content: [
        text({
          text: chat.title,
          style: {
            flex: "1",
            opacity: isCurrent ? "1" : "0.7",
          },
        }),
        button({
          id: `${IDS.BRAINSTORM.sessionRow(index)}-load`,
          iconId: "folder",
          style: { width: "24px", padding: "4px" },
          callback: () => {
            ctx.dispatch(chatSwitched(index));
            modal.close();
          },
        }),
        ...deleteContent,
      ],
    });
  });
}

function rebuildModal(
  ctx: BindContext<RootState>,
  modal: Modal,
  cleanups: (() => void)[],
) {
  // Unmount previous ButtonWithConfirmation instances
  cleanups.forEach((fn) => fn());
  cleanups.length = 0;

  modal.update({
    content: [
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
