/**
 * BrainstormPane — SUI orchestrator for the full Brainstorm panel content.
 *
 * Holds persistent SeChatHeader and SeBrainstormInput instances.
 * Creates SeMessage instances fresh each compose() from current store state.
 *
 * Structural rebuild trigger:
 *   Watches (currentChatIndex, messageIds[]) via StoreWatcher. When either
 *   changes, calls options.onRebuild() so the plugin can call
 *   api.v1.ui.update() on the brainstorm sidebar panel.
 *
 * StoreWatcher is disposed at the start of each compose() so subscriptions
 * do not accumulate across rebuilds of the same instance.
 */

import { SuiComponent, type SuiComponentOptions } from "nai-simple-ui";
import { createSelector } from "nai-store";
import { store } from "../../core/store";
import { currentMessages } from "../../core/store/slices/brainstorm";
import { StoreWatcher } from "../store-watcher";
import type { RootState } from "../../core/store/types";
import { SeChatHeader } from "./SeChatHeader";
import { SeBrainstormInput } from "./SeBrainstormInput";
import { SeMessage } from "./SeMessage";

type BrainstormPaneTheme = { default: { self: { style: object } } };
type BrainstormPaneState = Record<string, never>;

// Memoized: only recomputes when brainstorm slice reference changes
const selectBrainstormStructure = createSelector<
  RootState,
  [ReturnType<(s: RootState) => RootState["brainstorm"]>],
  { chatIndex: number; messageIds: string[] }
>(
  [(s: RootState) => s.brainstorm],
  (brainstorm) => ({
    chatIndex: brainstorm.currentChatIndex,
    messageIds: currentMessages(brainstorm).map((m) => m.id),
  }),
);

export type BrainstormPaneOptions = {
  /** Called when structural changes require a full panel rebuild. */
  onRebuild: () => void;
} & SuiComponentOptions<BrainstormPaneTheme, BrainstormPaneState>;

export class BrainstormPane extends SuiComponent<
  BrainstormPaneTheme,
  BrainstormPaneState,
  BrainstormPaneOptions,
  UIPartColumn
> {
  private readonly _watcher: StoreWatcher;
  private readonly _header: SeChatHeader;
  private readonly _input: SeBrainstormInput;

  constructor(options: BrainstormPaneOptions) {
    super(
      { state: {} as BrainstormPaneState, ...options },
      { default: { self: { style: {} } } },
    );
    this._watcher = new StoreWatcher();
    this._header = new SeChatHeader({ id: "se-bs-header" });
    this._input = new SeBrainstormInput({ id: "se-bs-input-area" });
  }

  async compose(): Promise<UIPartColumn> {
    const { onRebuild } = this.options;

    // Reset subscriptions to avoid duplicates on rebuild
    this._watcher.dispose();

    // Trigger a full rebuild when the chat switches or the message list changes structurally.
    // selectBrainstormStructure is memoized: returns same object ref when brainstorm slice
    // hasn't changed, so the watcher skips the equality check entirely on most dispatches.
    this._watcher.watch(
      selectBrainstormStructure,
      () => {
        onRebuild();
      },
      (a, b) =>
        a.chatIndex === b.chatIndex &&
        a.messageIds.length === b.messageIds.length &&
        a.messageIds.every((id: string, i: number) => id === b.messageIds[i]),
    );

    // Build message bubbles for the current chat.
    // Reversed so that with flex-direction: column-reverse the newest message
    // sits at the visual bottom while the scroll stays pinned there.
    const messages = currentMessages(store.getState().brainstorm)
      .slice()
      .reverse();
    const { column } = api.v1.ui.part;

    const messageParts = await Promise.all(
      messages.map((msg) =>
        new SeMessage({ id: `se-bs-msg-${msg.id}`, message: msg }).build(),
      ),
    );

    const [headerPart, inputPart] = await Promise.all([
      this._header.build(),
      this._input.build(),
    ]);

    // Match the v10 layout: height 100% + space-between on root,
    // flex 1 + overflow auto + column-reverse on the list.
    return column({
      id: this.id,
      style: { height: "100%", "justify-content": "space-between" },
      content: [
        headerPart,
        column({
          id: "se-bs-list",
          style: {
            flex: 1,
            overflow: "auto",
            "flex-direction": "column-reverse",
            "justify-content": "flex-start",
            gap: "10px",
            padding: "8px",
            "padding-bottom": "20px",
          },
          content: messageParts,
        }),
        inputPart,
      ],
    });
  }
}
