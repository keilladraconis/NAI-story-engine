/**
 * ForgeCommitBar — two-button [Discard]/[Commit] row for a forge chat, mirroring
 * RefineCommitBar. Both buttons END the forge session (delete the chat):
 *   - Discard (always enabled): tombstone + delete every draft, then close.
 *   - Commit (enabled when ≥1 draft): cast every draft to live, then close.
 *
 * The bar resolves the active forge chat from the store at compose and at click
 * time, so a stale closure can never act on the wrong (or an already-closed)
 * chat.
 */

import { SuiComponent, type SuiComponentOptions } from "nai-simple-ui";
import { store } from "../../core/store";
import {
  forgeCastAllRequested,
  forgeDiscardAllRequested,
} from "../../core/store/effects/forge-chat-effects";
import { StoreWatcher } from "../store-watcher";
import type { RootState } from "../../core/store/types";

type Theme = { default: { self: { style: object } } };
type State = { commitEnabled: boolean };

export type ForgeCommitBarOptions = SuiComponentOptions<Theme, State>;

/** The currently-visible forge chat's id, or null if the active chat is not a
 *  forge (a brainstorm / summary / refine is active). */
function activeForgeChatId(state: RootState): string | null {
  const { activeChatId, chats } = state.chat;
  const chat = chats.find((c) => c.id === activeChatId);
  return chat?.type === "forge" ? chat.id : null;
}

function draftCount(state: RootState, chatId: string): number {
  return Object.values(state.world.entitiesById).filter(
    (e) => e.lifecycle === "draft" && e.sourceChatId === chatId,
  ).length;
}

function hasDrafts(state: RootState): boolean {
  const id = activeForgeChatId(state);
  return !!id && draftCount(state, id) > 0;
}

const DISCARD_STYLE = {
  flex: "1",
  "background-color": "transparent",
  border: "1px solid rgba(255,255,255,0.12)",
  color: "rgba(255,255,255,0.6)",
};

const COMMIT_STYLE_BASE = {
  flex: "1",
  "font-weight": "bold",
  border: "1px solid rgba(80,200,120,0.6)",
  "background-color": "rgba(80,200,120,0.28)",
  color: "rgba(230,255,235,1)",
};

function commitStyle(enabled: boolean): Record<string, string> {
  return {
    ...COMMIT_STYLE_BASE,
    opacity: enabled ? "1" : "0.45",
    cursor: enabled ? "pointer" : "default",
  };
}

export class ForgeCommitBar extends SuiComponent<
  Theme,
  State,
  ForgeCommitBarOptions,
  UIPartRow
> {
  private readonly _watcher: StoreWatcher;

  constructor(options: ForgeCommitBarOptions) {
    super(
      { state: { commitEnabled: hasDrafts(store.getState()) }, ...options },
      { default: { self: { style: {} } } },
    );
    this._watcher = new StoreWatcher();
  }

  async compose(): Promise<UIPartRow> {
    this._watcher.dispose();
    this._watcher.watch(
      (s: RootState) => hasDrafts(s),
      (enabled: boolean) => {
        if (enabled !== this.state.commitEnabled) {
          void this.setState({ commitEnabled: enabled });
        }
      },
    );

    const { row, button } = api.v1.ui.part;
    return row({
      id: this.id,
      style: { gap: "8px", "margin-top": "8px" },
      content: [
        button({
          id: `${this.id}-discard`,
          text: "Discard",
          style: DISCARD_STYLE,
          callback: () => {
            const id = activeForgeChatId(store.getState());
            if (id) store.dispatch(forgeDiscardAllRequested({ chatId: id }));
          },
        }),
        button({
          id: `${this.id}-commit`,
          text: "Commit",
          disabled: !this.state.commitEnabled,
          style: commitStyle(this.state.commitEnabled),
          callback: () => {
            const id = activeForgeChatId(store.getState());
            if (id) store.dispatch(forgeCastAllRequested({ chatId: id }));
          },
        }),
      ],
    });
  }

  override async onSync(): Promise<void> {
    api.v1.ui.updateParts([
      {
        id: `${this.id}-commit`,
        disabled: !this.state.commitEnabled,
        style: commitStyle(this.state.commitEnabled),
      },
    ]);
  }
}
