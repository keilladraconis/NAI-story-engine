// A thread's status as one icon, in one fixed slot.
//
// Its own component because two surfaces show the same reading — the World
// list, where the point is that a column of them can be scanned, and the edit
// pane's control, where the same glyph has to mean the same thing. Two copies
// of "which icon is satisfied" is how the two surfaces start disagreeing.
//
// **Both readings are mounted; `display` picks.** Swapping one component type
// for another at a fixed position leaves both svgs in the DOM when the
// re-render arrives from a detached callback rather than a JSX event handler,
// and every render here is detached: status moves when the store moves, and
// from phase 6 it moves during the Engine's own pass with no press anywhere
// near it. `ConfirmButton.tsx` and `Header.tsx`'s WidgetIcon are the worked
// examples.

import { CheckCircle, Circle, MinusCircle } from "nai:icons/feather";
import { T } from "../../style";
import type { ThreadStatus } from "../../../core/store/types";
import { statusOption } from "./thread-display";

export function ThreadStatusIcon(props: {
  status: ThreadStatus;
  size: number;
}) {
  const satisfied = props.status === "satisfied";
  const abandoned = props.status === "abandoned";
  const open = !satisfied && !abandoned;
  return (
    <span
      title={statusOption(props.status).help}
      style={{
        display: "inline-flex",
        alignItems: "center",
        // Icons inherit this through SVG currentColor — the codebase passes
        // only `size` to feather icons, never a colour prop. Green for
        // satisfied, matching the "on" reading MemberToggle already uses;
        // an open thread is not a warning, so it sits at the dim end rather
        // than in `T.warning`.
        // Green for satisfied, matching the "on" reading MemberToggle uses.
        // Abandoned sits at the dim end with open: nothing went wrong, and a
        // warning colour would read as one — the story simply moved on.
        color: satisfied ? T.midIntensity : T.textDisabled,
      }}
    >
      <CheckCircle
        size={props.size}
        style={{ display: satisfied ? "inline-flex" : "none" }}
      />
      {/* A struck-through circle: closed like the check, but plainly not the
          same verdict, so a scan of the column separates a thread the writer
          resolved from one the story left behind. */}
      <MinusCircle
        size={props.size}
        style={{ display: abandoned ? "inline-flex" : "none" }}
      />
      <Circle
        size={props.size}
        style={{ display: open ? "inline-flex" : "none" }}
      />
    </span>
  );
}
