/**
 * SeChatHeader — SUI replacement for brainstorm/BrainstormHeader.ts
 *
 * Shows the current chat title, cowriter/critic mode buttons, and action buttons
 * (summarize, new chat, sessions). Title and mode buttons update reactively via
 * StoreWatcher without triggering a full panel rebuild.
 */

import { SuiComponent, type SuiComponentOptions } from "nai-simple-ui";
import { store } from "../../core/store";
import { uiBrainstormSummarize } from "../../core/store";
import {
  chatCreated,
  currentChat,
  modeChanged,
} from "../../core/store/slices/brainstorm";
import type { BrainstormMode } from "../../core/store/types";
import { StoreWatcher } from "../store-watcher";
import { SeConfirmButton } from "./SeConfirmButton";
import { openSeSessionsModal } from "./SeSessionsModal";

type SeChatHeaderTheme = { default: { self: { style: object } } };
type SeChatHeaderState = Record<string, never>;

export type SeChatHeaderOptions =
  SuiComponentOptions<SeChatHeaderTheme, SeChatHeaderState>;

const MODE_ACTIVE_COWRITER = "rgba(80,200,120,0.25)";
const MODE_ACTIVE_CRITIC   = "rgba(255,100,100,0.25)";
const MODE_INACTIVE        = "transparent";

function modeButtonStyle(isActive: boolean, color: string): object {
  return {
    padding:            "2px 8px",
    "font-size":        "0.75em",
    "border-radius":    "4px",
    "background-color": isActive ? color : MODE_INACTIVE,
    border:             isActive
      ? "1px solid rgba(255,255,255,0.2)"
      : "1px solid rgba(255,255,255,0.08)",
    opacity:            isActive ? "1" : "0.5",
  };
}

export class SeChatHeader extends SuiComponent<
  SeChatHeaderTheme,
  SeChatHeaderState,
  SeChatHeaderOptions,
  UIPartRow
> {
  private readonly _watcher:      StoreWatcher;
  private readonly _summarizeBtn: SeConfirmButton;

  constructor(options: SeChatHeaderOptions) {
    super(
      { state: {} as SeChatHeaderState, ...options },
      { default: { self: { style: {} } } },
    );
    this._watcher      = new StoreWatcher();
    this._summarizeBtn = new SeConfirmButton({
      id:           "se-bs-summarize",
      label:        "Sum",
      confirmLabel: "Summarize chat?",
      style:        { padding: "2px 8px", "font-size": "0.75em" },
      onConfirm:    async () => { store.dispatch(uiBrainstormSummarize()); },
    });
  }

  async compose(): Promise<UIPartRow> {
    // Dispose previous subscriptions to avoid duplicates on rebuild
    this._watcher.dispose();

    const initChat = currentChat(store.getState().brainstorm);
    const initMode: BrainstormMode = initChat.mode || "cowriter";

    // React to title + mode changes without a full panel rebuild
    this._watcher.watch(
      (s) => {
        const c = currentChat(s.brainstorm);
        return { title: c.title, mode: (c.mode || "cowriter") as BrainstormMode };
      },
      ({ title, mode }) => {
        api.v1.ui.updateParts([
          { id: "se-bs-title",         text:  title },
          { id: "se-bs-mode-cowriter", style: modeButtonStyle(mode === "cowriter", MODE_ACTIVE_COWRITER) },
          { id: "se-bs-mode-critic",   style: modeButtonStyle(mode === "critic",   MODE_ACTIVE_CRITIC) },
        ]);
      },
      (a, b) => a.title === b.title && a.mode === b.mode,
    );

    const summarizePart = await this._summarizeBtn.build();
    const { row, text, button } = api.v1.ui.part;

    return row({
      id:    this.id,
      style: {
        padding:         "8px",
        "align-items":   "center",
        gap:             "6px",
        "border-bottom": "1px solid rgba(255,255,255,0.1)",
        "flex-shrink":   "0",
      },
      content: [
        text({
          id:    "se-bs-title",
          text:  initChat.title,
          style: { flex: "1", "font-size": "0.85em", opacity: "0.8" },
        }),
        button({
          id:       "se-bs-mode-cowriter",
          text:     "Co",
          style:    modeButtonStyle(initMode === "cowriter", MODE_ACTIVE_COWRITER),
          callback: () => { store.dispatch(modeChanged("cowriter")); },
        }),
        button({
          id:       "se-bs-mode-critic",
          text:     "Crit",
          style:    modeButtonStyle(initMode === "critic", MODE_ACTIVE_CRITIC),
          callback: () => { store.dispatch(modeChanged("critic")); },
        }),
        summarizePart,
        button({
          id:       "se-bs-new-btn",
          iconId:   "plus" as IconId,
          style:    { width: "24px", padding: "4px" },
          callback: () => { store.dispatch(chatCreated()); },
        }),
        button({
          id:       "se-bs-sessions-btn",
          iconId:   "folder" as IconId,
          style:    { width: "24px", padding: "4px" },
          callback: () => { void openSeSessionsModal(); },
        }),
      ],
    });
  }
}
