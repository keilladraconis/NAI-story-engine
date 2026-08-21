// One Thread card: a per-thread collapse chevron + layers icon + title button
// (opens ThreadEditPane) + disabled lorebook toggle (deferred) + two-click
// confirm delete + member entity cards. Members exclude forge drafts (render in
// their forge chat). worldExpanded drives each member card's summary; the
// chevron collapses this thread's own member list independently.

import { useSlice } from "../../bridge";
import { T, SP } from "../../style";
import { store, threadDeleted, uiEditableActivate } from "../../../core/store";
import { isForgeDraft } from "../../../core/store/selectors/forge";
import { EntityCard } from "./EntityCard";
import { ConfirmButton } from "../../components/ConfirmButton";
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
          {collapsed ? (
            <ChevronRight size={ICON_SIZE} />
          ) : (
            <ChevronDown size={ICON_SIZE} />
          )}
        </button>
        <Layers size={ICON_SIZE} />
        <button
          onClick={() => store.dispatch(uiEditableActivate({ id: threadId }))}
          style={{
            flex: 1,
            textAlign: "left",
            background: "none",
            border: "none",
            cursor: "pointer",
            color: T.textHeadings,
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
          onConfirm={() => store.dispatch(threadDeleted({ threadId }))}
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
