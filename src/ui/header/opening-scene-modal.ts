// The Opening Scene modal — asks the writer how the story should open before
// anything is generated. It is the only bootstrap path now: Continue Scene was
// dropped in 0.15.0, so nothing generates prose from Setup without asking first.
//
// UIParts, not JSX: api.v1.ui.modal.open takes a UIPart[], so this is an API
// constraint rather than a leftover of the old UIPart header. Construction is
// kept separate from opening (buildOpeningSceneContent / openOpeningSceneModal)
// so the layout stays testable without a browser.
//
// The textarea is storageKey-bound, so its text is owned by storyStorage: the
// Generate button reads the slot rather than tracking keystrokes, and a draft
// survives dismissing the modal — re-open (or undo the opening and click again)
// and the direction is still there to tweak.

import { SP, T } from "../style";
import { STORAGE_KEYS } from "../../core/keys";

export const OPENING_MODAL_IDS = {
  modal: "kse-opening-modal",
  prompt: "kse-opening-prompt",
  input: "kse-opening-input",
  generate: "kse-opening-generate",
} as const;

/** Concrete and varied on purpose — three different kinds of answer (a
 *  technique, a story beat, a literal moment) teach the box's range faster than
 *  an abstract instruction would. */
export const OPENING_PLACEHOLDER =
  "in media res, the protagonist's first trauma, waking up on the first day at the new high school...";

const PROMPT_STYLE: Record<string, string> = {
  color: T.textHeadings,
  fontWeight: "bold",
};

const INPUT_STYLE: Record<string, string> = {
  background: T.bg2,
  color: T.text,
  fontFamily: T.fontDefault,
  padding: SP.md,
  border: "none",
  minHeight: "6em",
  width: "100%",
  resize: "vertical",
};

const GENERATE_STYLE: Record<string, string> = {
  padding: "6px 12px",
  background: T.bg2,
  border: "none",
  cursor: "pointer",
  color: T.textHeadings,
  alignSelf: "flex-end",
};

/**
 * Modal body. `onGenerate` receives the writer's direction — empty string when
 * they generated without typing anything, which is a supported answer and means
 * "just open it".
 */
export function buildOpeningSceneContent(
  onGenerate: (guidance: string) => void,
): UIPart[] {
  return [
    api.v1.ui.part.column({
      id: "kse-opening-column",
      style: { display: "flex", flexDirection: "column", gap: SP.md },
      content: [
        api.v1.ui.part.text({
          id: OPENING_MODAL_IDS.prompt,
          text: "Open the story with:",
          style: PROMPT_STYLE,
        }),
        api.v1.ui.part.multilineTextInput({
          id: OPENING_MODAL_IDS.input,
          // `story:` is the routing prefix, stripped before storage — the slot
          // itself is the bare STORAGE_KEYS.OPENING_GUIDANCE the button reads.
          storageKey: `story:${STORAGE_KEYS.OPENING_GUIDANCE}`,
          placeholder: OPENING_PLACEHOLDER,
          style: INPUT_STYLE,
          // Ctrl+Enter submits with the live value in hand, so it does not need
          // the storyStorage round-trip the button below does.
          onSubmit: (value: string) => onGenerate(value),
        }),
        api.v1.ui.part.button({
          id: OPENING_MODAL_IDS.generate,
          text: "Generate",
          iconId: "feather",
          // One opening per press: bootstrap is not idempotent, and a mobile tap
          // can deliver click twice.
          disabledWhileCallbackRunning: true,
          style: GENERATE_STYLE,
          callback: async () => {
            const guidance = (await api.v1.storyStorage.get(
              STORAGE_KEYS.OPENING_GUIDANCE,
            )) as string | null;
            onGenerate(guidance ?? "");
          },
        }),
      ],
    }),
  ];
}

/**
 * Open the modal and hand the writer's direction to `onGenerate` exactly once.
 * Resolves when the modal has closed — whether it launched a generation or the
 * writer dismissed it.
 */
export async function openOpeningSceneModal(
  onGenerate: (guidance: string) => void,
): Promise<void> {
  // Ctrl+Enter and the button are two routes to the same launch; whichever
  // fires first closes the modal, and the other must not queue a second opening
  // in the gap before the close lands.
  let launched = false;
  let opened: { close: () => Promise<void> } | null = null;

  const modal = await api.v1.ui.modal.open({
    id: OPENING_MODAL_IDS.modal,
    title: "Opening Scene",
    // One question and a textarea — but the placeholder examples are a full line
    // each, and a cramped box invites one-word answers.
    size: "medium",
    content: buildOpeningSceneContent((guidance) => {
      if (launched) return;
      launched = true;
      void opened?.close();
      onGenerate(guidance);
    }),
  });
  opened = modal;

  await modal.closed;
}
