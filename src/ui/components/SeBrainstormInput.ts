/**
 * SeBrainstormInput — multiline input + send/clear controls for the chat panel.
 *
 * Sends to the active chat from the chat slice. When `chat.refineChat` is set,
 * sends to the refine chat instead. Disabled while a chat / chatRefine
 * generation is active.
 */

import { SuiComponent, type SuiComponentOptions } from "nai-simple-ui";
import { store } from "../../core/store";
import { uiChatSubmitUserMessage } from "../../core/store";
import { messageRemoved } from "../../core/store/slices/chat";
import type { Chat } from "../../core/chat-types/types";
import { getChatTypeSpec } from "../../core/chat-types";
import { StoreWatcher } from "../store-watcher";
import { SeGenerationButton } from "./SeGenerationButton";
import { SeConfirmButton } from "./SeConfirmButton";

type SeBrainstormInputTheme = { default: { self: { style: object } } };
type SeBrainstormInputState = Record<string, never>;

export type SeBrainstormInputOptions = SuiComponentOptions<
  SeBrainstormInputTheme,
  SeBrainstormInputState
>;

const INPUT_ID = "se-bs-input";

const DEFAULT_PLACEHOLDER =
  "Explore ideas here — then switch to Story Engine to Forge.";

/** Request types that occupy the chat surface — sending while one is in flight
 *  (or queued) just stacks empty assistant bubbles, so the input locks out. */
function isChatBusyType(t: string | undefined): boolean {
  return (
    t === "chat" ||
    t === "chatRefine" ||
    t === "forgeChat" ||
    t === "forgeCleanup"
  );
}

/** The chat the input writes to: refineChat takes precedence over active. */
function visibleChat(): Chat | null {
  const s = store.getState();
  return (
    s.chat.refineChat ??
    s.chat.chats.find((c) => c.id === s.chat.activeChatId) ??
    null
  );
}

function dispatchSubmit(): void {
  const chat = visibleChat();
  if (!chat) return;
  store.dispatch(uiChatSubmitUserMessage({ chatId: chat.id }));
}

export class SeBrainstormInput extends SuiComponent<
  SeBrainstormInputTheme,
  SeBrainstormInputState,
  SeBrainstormInputOptions,
  UIPartColumn
> {
  private readonly _watcher: StoreWatcher;
  private readonly _sendBtn: SeGenerationButton;
  private readonly _clearBtn: SeConfirmButton;

  constructor(options: SeBrainstormInputOptions) {
    super(
      { state: {} as SeBrainstormInputState, ...options },
      { default: { self: { style: {} } } },
    );
    this._watcher = new StoreWatcher();
    this._sendBtn = new SeGenerationButton({
      id: "se-bs-send-btn",
      // Re-read per build so the label tracks the active chat type
      // (e.g. "Continue Forging" in a forge session).
      labelProvider: () => {
        const chat = visibleChat();
        return (chat && getChatTypeSpec(chat.type).sendLabel) || "Send";
      },
      style: { flex: "0.7" },
      onGenerate: () => dispatchSubmit(),
      stateProjection: (s) => {
        if (isChatBusyType(s.runtime.activeRequest?.type)) {
          return s.runtime.activeRequest!.id;
        }
        return s.runtime.queue.find((r) => isChatBusyType(r.type))?.id;
      },
      requestIdFromProjection: (p) => p as string | undefined,
    });
    this._clearBtn = new SeConfirmButton({
      id: "se-bs-input-btn-clear",
      label: "Clear",
      confirmLabel: "Clear?",
      style: { flex: "0.3" },
      onConfirm: async () => {
        const s = store.getState();
        const chat =
          s.chat.refineChat ??
          s.chat.chats.find((c) => c.id === s.chat.activeChatId) ??
          null;
        if (!chat) return;
        // Clear messages by removing each one — chat slice has no bulk reset action.
        const ids = chat.messages.map((m) => m.id);
        for (const id of ids) {
          store.dispatch(messageRemoved({ chatId: chat.id, id }));
        }
      },
    });
  }

  async compose(): Promise<UIPartColumn> {
    // Dispose previous subscriptions to avoid duplicates on rebuild
    this._watcher.dispose();

    // Lock the input while a chat/forge generation is active OR queued — both
    // states mean another send would only stack empty assistant bubbles. This
    // is the visible "waiting on tokens" signal during a budget wait too.
    this._watcher.watch(
      (s) => {
        if (isChatBusyType(s.runtime.activeRequest?.type)) return true;
        return s.runtime.queue.some((r) => isChatBusyType(r.type));
      },
      (isBusy) => {
        api.v1.ui.updateParts([
          {
            id: INPUT_ID,
            disabled: isBusy,
          } as unknown as Partial<UIPart> & { id: string },
        ]);
      },
    );

    const chat = visibleChat();
    const spec = chat ? getChatTypeSpec(chat.type) : null;
    const placeholder = spec?.inputPlaceholder ?? DEFAULT_PLACEHOLDER;
    const showClear = spec?.showClearButton ?? true;

    const sendPart = await this._sendBtn.build();
    const footerContent: UIPart[] = [];
    if (showClear) footerContent.push(await this._clearBtn.build());
    footerContent.push(sendPart);

    const { column, row, multilineTextInput } = api.v1.ui.part;

    return column({
      id: this.id,
      style: { padding: "8px", gap: "4px" },
      content: [
        multilineTextInput({
          id: INPUT_ID,
          placeholder,
          storageKey: `story:${INPUT_ID}`,
          style: { "min-height": "60px", "max-height": "120px" },
          onSubmit: () => {
            dispatchSubmit();
          },
        }),
        row({
          style: { gap: "8px", "margin-top": "4px" },
          content: footerContent,
        }),
      ],
    });
  }
}
