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
          id: `${this.id}-discard`,
          text: "Discard",
          style: DISCARD_STYLE,
          callback: () => store.dispatch(uiChatRefineDiscarded()),
        }),
        button({
          id: `${this.id}-commit`,
          text: "Commit",
          disabled: !this.state.commitEnabled,
          style: commitStyle(this.state.commitEnabled),
          callback: () => store.dispatch(uiChatRefineCommitted()),
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
