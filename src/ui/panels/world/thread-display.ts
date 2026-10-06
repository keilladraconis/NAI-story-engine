// The words the World's thread surfaces put on a status, and the add-thread
// control's reading of the Engine's limit.
//
// A `.ts` module rather than a const block inside `ThreadEditPane.tsx`: vitest
// here collects `tests/**/*.test.ts` in a node environment, so nothing inside a
// `.tsx` can be asserted except by scanning its source.
//
// Icons live in the components, not here. `nai:icons/feather` is a virtual
// module the bundler provides; importing it into a module vitest collects
// would break the tests that hold this file.

import { effectiveCap } from "../../../core/engine/thread-cap";
import type { ThreadStatus } from "../../../core/store/types";

export type StatusOption = {
  id: ThreadStatus;
  /** The word beside the icon. */
  label: string;
  /** What this reading means — the icon's tooltip in the World list. */
  help: string;
  /** What pressing the pane's control does from here. */
  action: string;
};

const STATUS_TEXT: Record<ThreadStatus, StatusOption> = {
  open: {
    id: "open",
    label: "Open",
    help: "Open — the story can still change how this stands",
    action: "Conclude",
  },
  concluded: {
    id: "concluded",
    label: "Concluded",
    help: "Concluded — settled, and written into its cast's own entries",
    action: "Reopen",
  },
};

export const STATUS_OPTIONS: readonly StatusOption[] = [
  STATUS_TEXT.open,
  STATUS_TEXT.concluded,
];

export function statusOption(status: ThreadStatus): StatusOption {
  return STATUS_TEXT[status];
}

/** The status the pane's control moves a Thread to. The value it returns is
 *  what the action carries — `threadStatusSet` takes a status, not a toggle —
 *  so a press delivered twice against one rendered state sets the same value
 *  twice instead of walking back. */
export function nextStatus(status: ThreadStatus): ThreadStatus {
  return status === "open" ? "concluded" : "open";
}

export type ThreadAddModel = {
  /** Open Threads against the Engine's limit, drawn beside the icon: `"3/8"`. */
  count: string;
  title: string;
};

/** What the World header's add-thread button reads as.
 *
 *  The limit restrains the Engine's admissions and nothing else, so this
 *  control never refuses. It shows the count because a writer at the limit
 *  should know why the Engine has stopped proposing Threads. */
export function threadAddModel(openCount: number, cap: number): ThreadAddModel {
  const count = `${openCount}/${effectiveCap(cap)}`;
  return {
    count,
    title:
      openCount >= effectiveCap(cap)
        ? `Add thread (${count}) — at the limit the Engine admits no more on its own; you still can`
        : `Add thread (${count})`,
  };
}
