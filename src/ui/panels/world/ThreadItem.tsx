// One Thread card: a per-thread collapse chevron + layers icon + status icon +
// title button (opens ThreadEditPane) + disabled lorebook toggle (deferred) +
// two-click confirm delete + member entity cards. Members exclude forge drafts
// (render in their forge chat). worldExpanded drives each member card's
// summary; the chevron collapses this thread's own member list independently.
//
// **Status is a slot, not a section.** Every row carries the indicator, in the
// same position, whatever the status — §9.1's instinct for the HUD applies to a
// column too: a reader scans a shape rather than decoding one. Sorting the
// satisfied threads to the bottom, or hiding them behind a filter, would move
// rows under the finger reaching for them and hide the ones a writer has to
// find to reopen. The title recedes with the icon, because one 16px glyph is a
// weak signal in a list and the pair reads finished at arm's length.

import { useSlice } from "../../bridge";
import { T, SP } from "../../style";
import { store, threadDeleted, uiEditableActivate } from "../../../core/store";
import { isForgeDraft } from "../../../core/store/selectors/forge";
import { EntityCard } from "./EntityCard";
import { ConfirmButton } from "../../components/ConfirmButton";
import { ThreadStatusIcon } from "./ThreadStatusIcon";
import {
  Layers,
  ToggleLeft,
  ChevronDown,
  ChevronRight,
} from "nai:icons/feather";

const ICON_SIZE = 16;

export function ThreadItem(props: { threadId: string }) {
  const { threadId } = props;
  const thread = useSlice((s) =>
    s.world.threads.find((t) => t.id === threadId),
  );
  const entitiesById = useSlice((s) => s.world.entitiesById);
  const [collapsed, setCollapsed] = useState(false);

  if (!thread) return null;

  // Either retired reading dims the title: the point of the dimming is "this
  // one is closed", which is true of both.
  const retired = thread.status !== "open";

  const memberIds = thread.entityIds.filter((id) => {
    const e = entitiesById[id];
    return !!e && !isForgeDraft(e);
  });

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
        <button
          title={collapsed ? "Expand thread" : "Collapse thread"}
          onClick={() => setCollapsed((c) => !c)}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: T.text,
            display: "flex",
            alignItems: "center",
            padding: 0,
          }}
        >
          {/* Both mounted, `display` picks. This one is driven by local state
              from its own click, so its render is attached and no failure could
              be constructed today — but the structure should not depend on
              which callback happens to repaint it, and phase 6 gives the World
              plenty of detached renders. */}
          <ChevronRight
            size={ICON_SIZE}
            style={{ display: collapsed ? "inline-flex" : "none" }}
          />
          <ChevronDown
            size={ICON_SIZE}
            style={{ display: collapsed ? "none" : "inline-flex" }}
          />
        </button>
        <Layers size={ICON_SIZE} />
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
        {/* Deferred: thread lorebook sync — shown disabled. */}
        <button
          title="Lorebook sync (coming soon)"
          disabled
          style={{
            background: "none",
            border: "none",
            cursor: "default",
            opacity: 0.35,
          }}
        >
          <ToggleLeft size={ICON_SIZE} />
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
      {!collapsed ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: SP.xs,
            paddingLeft: SP.sm,
          }}
        >
          {memberIds.map((id) => (
            <EntityCard key={`${threadId}:${id}`} entityId={id} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
