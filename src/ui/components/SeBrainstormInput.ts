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

/** Resolve the chat id the input should write to: refineChat takes precedence. */
function targetChatId(): string | null {
  const s = store.getState();
  return s.chat.refineChat?.id ?? s.chat.activeChatId;
}

function dispatchSubmit(): void {
  const chatId = targetChatId();
  if (!chatId) return;
  store.dispatch(uiChatSubmitUserMessage({ chatId }));
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
      label: "Send",
      style: { flex: "0.7" },
      onGenerate: () => dispatchSubmit(),
      stateProjection: (s) => {
        const t = s.runtime.activeRequest?.type;
        if (t === "chat" || t === "chatRefine") {
          return s.runtime.activeRequest!.id;
        }
        return s.runtime.queue.find(
          (r) => r.type === "chat" || r.type === "chatRefine",
        )?.id;
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

    // Keep textarea disabled while a chat-driven generation is active
    this._watcher.watch(
      (s) => {
        const t = s.runtime.activeRequest?.type;
        return (
          (t === "chat" || t === "chatRefine") &&
          s.runtime.genx.status === "generating"
        );
      },
      (isGenerating) => {
        api.v1.ui.updateParts([
          {
            id: INPUT_ID,
            disabled: isGenerating,
          } as unknown as Partial<UIPart> & { id: string },
        ]);
      },
    );

    const [sendPart, clearPart] = await Promise.all([
      this._sendBtn.build(),
      this._clearBtn.build(),
    ]);

    const { column, row, multilineTextInput } = api.v1.ui.part;

    return column({
      id: this.id,
      style: { padding: "8px", gap: "4px" },
      content: [
        multilineTextInput({
          id: INPUT_ID,
          placeholder:
            "Explore ideas here — then switch to Story Engine to Forge.",
          storageKey: `story:${INPUT_ID}`,
          style: { "min-height": "60px", "max-height": "120px" },
          onSubmit: () => {
            dispatchSubmit();
          },
        }),
        row({
          style: { gap: "8px", "margin-top": "4px" },
          content: [clearPart, sendPart],
        }),
      ],
    });
  }
}
