// One Thread row: status icon + title button (opens ThreadEditPane) + two-click
// confirm delete. One line, and deliberately so.
//
// **A thread no longer wraps its cast.** It used to render its members as
// entity cards beneath it, which hid those entities from the World list and
// made the thread the only way to reach them. A thread's cast is what its
// detector probes for (`thread-condition.ts`) — a different job from filing —
// so membership is edited in `ThreadEditPane` and the World lists every entity
// once, in one place. With the members gone the per-thread collapse chevron had
// nothing left to collapse, and the disabled "lorebook sync (coming soon)"
// toggle was a placeholder for always-on threads, which the condition replaced.
//
// **Status is still a slot, not a section.** Every row carries the indicator in
// the same position, whatever the status — a reader scans a shape rather than
// decoding one. This file used to argue from that against hiding retired
// threads at all, on the grounds that reopening one means finding it first.
// That objection was right about the danger and wrong about the remedy: the
// fold in `World.tsx` keeps them findable, one click away, instead of leaving
// twenty settled rows on top of the three the story still owes. The title
// recedes with the icon, because one 16px glyph is a weak signal in a list and
// the pair reads finished at arm's length.

import { useSlice } from "../../bridge";
import { T, SP } from "../../style";
import { store, threadDeleted, uiEditableActivate } from "../../../core/store";
import { ConfirmButton } from "../../components/ConfirmButton";
import { ThreadStatusIcon } from "./ThreadStatusIcon";

const ICON_SIZE = 16;

export function ThreadItem(props: { threadId: string }) {
  const { threadId } = props;
  const thread = useSlice((s) =>
    s.world.threads.find((t) => t.id === threadId),
  );

  if (!thread) return null;

  // Either retired reading dims the title: the point of the dimming is "this
  // one is closed", which is true of both.
  const retired = thread.status !== "open";

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: SP.sm,
          padding: SP.sm,
          background: T.bg2,
        }}
      >
        <ThreadStatusIcon status={thread.status} size={ICON_SIZE} />
        <button
          onClick={() => store.dispatch(uiEditableActivate({ id: threadId }))}
          style={{
            flex: 1,
            textAlign: "left",
            background: "none",
            border: "none",
            cursor: "pointer",
            color: T.textHeadings,
            opacity: retired ? 0.55 : 1,
            padding: 0,
          }}
        >
          {thread.title || "New Thread"}
        </button>
        <ConfirmButton
          title="Delete thread"
          onConfirm={() =>
            store.dispatch(
              // The entry id travels with the delete: the effect that switches
              // the orphaned always-on note off runs after the reducer, by
              // which time the thread that owned it is gone.
              threadDeleted({
                threadId,
                lorebookEntryId: thread.lorebookEntryId,
              }),
            )
          }
        />
      </div>
    </div>
  );
}
