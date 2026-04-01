/**
 * SeBrainstormInput — SUI replacement for brainstorm/Input.ts
 *
 * Multiline textarea + SeGenerationButton (send) + SeConfirmButton (clear).
 * Textarea is disabled while a brainstorm generation is active.
 */

import { SuiComponent, type SuiComponentOptions } from "nai-simple-ui";
import { store } from "../../core/store";
import {
  messagesCleared,
  uiBrainstormSubmitUserMessage,
} from "../../core/store";
import { StoreWatcher } from "../store-watcher";
import { SeGenerationButton } from "./SeGenerationButton";
import { SeConfirmButton } from "./SeConfirmButton";

type SeBrainstormInputTheme = { default: { self: { style: object } } };
type SeBrainstormInputState = Record<string, never>;

export type SeBrainstormInputOptions =
  SuiComponentOptions<SeBrainstormInputTheme, SeBrainstormInputState>;

const INPUT_ID = "se-bs-input";

export class SeBrainstormInput extends SuiComponent<
  SeBrainstormInputTheme,
  SeBrainstormInputState,
  SeBrainstormInputOptions,
  UIPartColumn
> {
  private readonly _watcher:  StoreWatcher;
  private readonly _sendBtn:  SeGenerationButton;
  private readonly _clearBtn: SeConfirmButton;

  constructor(options: SeBrainstormInputOptions) {
    super(
      { state: {} as SeBrainstormInputState, ...options },
      { default: { self: { style: {} } } },
    );
    this._watcher  = new StoreWatcher();
    this._sendBtn  = new SeGenerationButton({
      id:                      "se-bs-send-btn",
      label:                   "Send",
      style:                   { flex: "0.7" },
      generateAction:          uiBrainstormSubmitUserMessage(),
      stateProjection:         (s) => {
        if (s.runtime.activeRequest?.type === "brainstorm") {
          return s.runtime.activeRequest.id;
        }
        return s.runtime.queue.find(r => r.type === "brainstorm")?.id;
      },
      requestIdFromProjection: (p) => p as string | undefined,
    });
    this._clearBtn = new SeConfirmButton({
      id:           "se-bs-input-btn-clear",
      label:        "Clear",
      confirmLabel: "Clear?",
      style:        { flex: "0.3" },
      onConfirm:    async () => { store.dispatch(messagesCleared()); },
    });
  }

  async compose(): Promise<UIPartColumn> {
    // Dispose previous subscriptions to avoid duplicates on rebuild
    this._watcher.dispose();

    // Keep textarea disabled while brainstorm is generating
    this._watcher.watch(
      (s) =>
        s.runtime.activeRequest?.type === "brainstorm" &&
        s.runtime.genx.status === "generating",
      (isGenerating) => {
        api.v1.ui.updateParts([
          { id: INPUT_ID, disabled: isGenerating } as unknown as Partial<UIPart> & { id: string },
        ]);
      },
    );

    const [sendPart, clearPart] = await Promise.all([
      this._sendBtn.build(),
      this._clearBtn.build(),
    ]);

    const { column, row, multilineTextInput } = api.v1.ui.part;

    return column({
      id:    this.id,
      style: { padding: "8px", gap: "4px" },
      content: [
        multilineTextInput({
          id:          INPUT_ID,
          placeholder: "Explore ideas here — then switch to Story Engine to Forge.",
          storageKey:  `story:${INPUT_ID}`,
          style:       { "min-height": "60px", "max-height": "120px" },
          onSubmit:    () => { store.dispatch(uiBrainstormSubmitUserMessage()); },
        }),
        row({
          style:   { gap: "8px", "margin-top": "4px" },
          content: [clearPart, sendPart],
        }),
      ],
    });
  }
}
