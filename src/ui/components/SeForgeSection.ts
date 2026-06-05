/**
 * SeForgeSection — Forge guidance input + generation button.
 *
 * Contains:
 *   - Guidance multilineTextInput (storageKey)
 *   - Forge SeGenerationButton
 *   - Ticker text (updated by generation handlers)
 */

import { SuiComponent, type SuiComponentOptions } from "nai-simple-ui";
import { store } from "../../core/store";
import { chatSwitched } from "../../core/store/slices/chat";
import { forgeChatNewSessionRequested } from "../../core/store/effects/forge-chat-effects";
import { selectActiveForgeChatId } from "../../core/store/selectors/forge";
import { getChatTypeSpec } from "../../core/chat-types";
import { IDS, STORAGE_KEYS } from "../../ui/framework/ids";
import { SeGenerationButton } from "./SeGenerationButton";

type SeForgeSectionTheme = { default: { self: { style: object } } };
type SeForgeSectionState = Record<string, never>;

export type SeForgeSectionOptions = SuiComponentOptions<
  SeForgeSectionTheme,
  SeForgeSectionState
>;

const FG = IDS.FORGE;

export class SeForgeSection extends SuiComponent<
  SeForgeSectionTheme,
  SeForgeSectionState,
  SeForgeSectionOptions,
  UIPartCollapsibleSection
> {
  private readonly _forgeBtn: SeGenerationButton;

  constructor(options: SeForgeSectionOptions) {
    super(
      { state: {} as SeForgeSectionState, ...options },
      { default: { self: { style: {} } } },
    );

    this._forgeBtn = new SeGenerationButton({
      id: FG.FORGE_BTN,
      label: "Forge",
      onGenerate: async () => {
        const guidance =
          ((await api.v1.storyStorage.get(
            STORAGE_KEYS.FORGE_GUIDANCE_UI,
          )) as string) || "";
        const activeId = selectActiveForgeChatId(store.getState());
        if (activeId) {
          // Resume the open session. Feed the guidance in exactly as a chat-input
          // send would (Cast All / Discard All are what close a session) so it
          // is no longer dropped on the floor.
          store.dispatch(chatSwitched({ id: activeId }));
          if (guidance.trim()) {
            const chat = store
              .getState()
              .chat.chats.find((c) => c.id === activeId);
            if (chat) {
              getChatTypeSpec("forge").handleSend?.(chat, guidance, {
                getState: store.getState,
                dispatch: store.dispatch,
              });
            }
          }
        } else {
          store.dispatch(
            forgeChatNewSessionRequested({ initialUserMessage: guidance }),
          );
        }
        if (guidance.trim()) {
          await api.v1.storyStorage.remove(STORAGE_KEYS.FORGE_GUIDANCE_UI);
        }
      },
      stateProjection: (s) => {
        const t = s.runtime.activeRequest?.type;
        return {
          activeForgeId:
            t === "forgeChat" || t === "forgeCleanup"
              ? s.runtime.activeRequest!.id
              : undefined,
        };
      },
      requestIdFromProjection: (p) =>
        (p as { activeForgeId?: string }).activeForgeId,
      isDisabledFromProjection: () => false,
    });
  }

  async compose(): Promise<UIPartCollapsibleSection> {
    const { column, row, text, collapsibleSection, multilineTextInput } =
      api.v1.ui.part;

    const forgeBtnPart = await this._forgeBtn.build();

    const guidanceInput = multilineTextInput({
      id: FG.GUIDANCE_INPUT,
      placeholder:
        "What should the Forge build? Leave blank to draw from your Brainstorm conversation.",
      initialValue: "",
      storageKey: `story:${STORAGE_KEYS.FORGE_GUIDANCE_UI}`,
      style: { "min-height": "5em", "font-size": "0.85em" },
    });

    const ticker = text({
      id: FG.TICKER,
      text: "",
      style: {
        "font-size": "0.75em",
        opacity: "0.5",
        "font-style": "italic",
        "min-height": "1em",
      },
    });

    return collapsibleSection({
      id: FG.SECTION,
      title: "Forge",
      content: [
        column({
          style: { gap: "6px" },
          content: [
            guidanceInput,
            row({
              style: { gap: "6px" },
              content: [forgeBtnPart],
            }),
            ticker,
          ],
        }),
      ],
    });
  }
}
