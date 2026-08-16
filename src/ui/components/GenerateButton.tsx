// The generate/refine icon button. One button, one press target, two glyphs:
// the ⚡ bolt when a press starts a fresh generation, the quill when it opens a
// refine on text that already exists. The tooltip follows the glyph — "Refine"
// in refine mode, the caller's own label otherwise — so the button says what it
// will do before it is pressed.
//
// Both icons stay mounted and toggle via `display` rather than swapping the
// component type at one position. A type swap leaves the old svg behind when
// the re-render arrives from a detached callback (a store subscription or a
// timer tick), so the button would show a bolt AND a quill. Same workaround as
// ConfirmButton and the header's WidgetIcon.

import { Zap, Feather } from "nai:icons/feather";

const ICON_SIZE = 16;

/** What a press will do. Matches `decideFieldAction`'s return type, so callers
 *  that already ask it which action to dispatch can pass the answer straight
 *  through — the glyph and the dispatch can never disagree. */
export type GenerateMode = "generate" | "refine";

export function GenerateButton(props: {
  mode: GenerateMode;
  /** Tooltip for the generate mode. Refine mode always reads "Refine". */
  title: string;
  /** Dims the button and shows "Generating…". Also disables unless the caller
   *  passes its own `disabled`. */
  pending?: boolean;
  /** Overrides the pending-derived disabled state (e.g. also disabled while the
   *  pane is still loading its lorebook entry). */
  disabled?: boolean;
  size?: number;
  onClick: () => void;
}) {
  const refine = props.mode === "refine";
  const pending = props.pending ?? false;
  const size = props.size ?? ICON_SIZE;

  return (
    <button
      title={pending ? "Generating…" : refine ? "Refine" : props.title}
      onClick={props.onClick}
      disabled={props.disabled ?? pending}
      style={{
        background: "none",
        border: "none",
        cursor: pending ? "default" : "pointer",
        opacity: pending ? 0.4 : 1,
      }}
    >
      <Zap size={size} style={{ display: refine ? "none" : "inline" }} />
      <Feather size={size} style={{ display: refine ? "inline" : "none" }} />
    </button>
  );
}
