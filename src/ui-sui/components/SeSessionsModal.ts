/**
 * openSeSessionsModal — Brainstorm sessions list modal.
 *
 * Opens a small modal listing all chat sessions. Each row shows the title
 * with a load button (switches to that session) and a delete button.
 * Rebuilds modal content after each delete. Phase 2: titles are read-only;
 * rename support can be added in a later phase.
 */

import { store } from "../../core/store";
import {
  chatDeleted,
  chatSwitched,
} from "../../core/store/slices/brainstorm";

export async function openSeSessionsModal(): Promise<void> {
  const modal = await api.v1.ui.modal.open({
    title:   "Brainstorm Sessions",
    size:    "small",
    content: [],
  });

  function buildContent(): UIPart[] {
    const { chats, currentChatIndex } = store.getState().brainstorm;
    const { column, row, text, button } = api.v1.ui.part;

    const sessionRows = chats.map((chat, index) => {
      const isCurrent = index === currentChatIndex;
      const canDelete  = chats.length > 1;
      const rowId      = `se-bs-session-${index}`;

      const controls: UIPart[] = [
        button({
          id:       `${rowId}-load`,
          iconId:   "folder" as IconId,
          style:    { width: "24px", padding: "4px" },
          callback: () => {
            store.dispatch(chatSwitched(index));
            void modal.close();
          },
        }),
      ];

      if (canDelete) {
        controls.push(
          button({
            id:       `${rowId}-del`,
            iconId:   "trash" as IconId,
            style:    { width: "24px", padding: "4px", opacity: "0.5" },
            callback: () => {
              store.dispatch(chatDeleted(index));
              void modal.update({ content: buildContent() });
            },
          }),
        );
      }

      return column({
        id:    rowId,
        style: {
          padding:            "6px 8px",
          "border-bottom":    "1px solid rgba(255,255,255,0.05)",
          "background-color": isCurrent
            ? "rgba(64,156,255,0.15)"
            : "transparent",
        },
        content: [
          row({
            style:   { "align-items": "center", gap: "4px" },
            content: [
              text({
                id:    `${rowId}-title`,
                text:  chat.title,
                style: { flex: "1", "font-size": "0.85em" },
              }),
              ...controls,
            ],
          }),
        ],
      });
    });

    return [
      text({
        text:     "_The active session is included as Story Engine context._",
        markdown: true,
        style:    { "font-size": "0.8em", opacity: "0.6", padding: "4px 8px" },
      }),
      column({
        style:   { gap: "2px" },
        content: sessionRows,
      }),
    ];
  }

  await modal.update({ content: buildContent() });
}
