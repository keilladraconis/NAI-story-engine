/**
 * RefineCommitBar — two-button row for refine chat commit/discard.
 * Commit is enabled only when the refine chat has at least one non-empty
 * assistant message; Discard is always enabled.
 */

import { SuiComponent, type SuiComponentOptions } from "nai-simple-ui";
import { store } from "../../core/store";
import {
  uiChatRefineCommitted,
  uiChatRefineDiscarded,
} from "../../core/store/slices/ui";
import { StoreWatcher } from "../store-watcher";
import type { RootState } from "../../core/store/types";

type Theme = { default: { self: { style: object } } };
type State = { commitEnabled: boolean };

export type RefineCommitBarOptions = SuiComponentOptions<Theme, State>;

function hasCandidate(state: RootState): boolean {
  const refine = state.chat.refineChat;
  if (!refine) return false;
  return refine.messages.some(
    (m) => m.role === "assistant" && m.content.trim().length > 0,
  );
}

export class RefineCommitBar extends SuiComponent<
  Theme,
  State,
  RefineCommitBarOptions,
  UIPartRow
> {
  private readonly _watcher: StoreWatcher;

  constructor(options: RefineCommitBarOptions) {
    super(
      { state: { commitEnabled: hasCandidate(store.getState()) }, ...options },
      { default: { self: { style: {} } } },
    );
    this._watcher = new StoreWatcher();
  }

  async compose(): Promise<UIPartRow> {
    this._watcher.dispose();
    this._watcher.watch(
      (s: RootState) => hasCandidate(s),
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
          id: `${this.id}-commit`,
          text: "Commit",
          style: {
            flex: "1",
            "font-weight": "bold",
            opacity: this.state.commitEnabled ? "1" : "0.5",
            cursor: this.state.commitEnabled ? "pointer" : "default",
          },
          callback: this.state.commitEnabled
            ? () => store.dispatch(uiChatRefineCommitted())
            : () => {},
        }),
        button({
          id: `${this.id}-discard`,
          text: "Discard",
          style: { flex: "1" },
          callback: () => store.dispatch(uiChatRefineDiscarded()),
        }),
      ],
    });
  }

  override async onSync(): Promise<void> {
    api.v1.ui.updateParts([
      {
        id: `${this.id}-commit`,
        style: {
          flex: "1",
          "font-weight": "bold",
          opacity: this.state.commitEnabled ? "1" : "0.5",
          cursor: this.state.commitEnabled ? "pointer" : "default",
        },
        callback: this.state.commitEnabled
          ? () => store.dispatch(uiChatRefineCommitted())
          : () => {},
      },
    ]);
  }
}
