// One Thread card: a per-thread collapse chevron + layers icon + title button
// (opens ThreadEditPane) + disabled lorebook toggle (deferred) + two-click
// confirm delete + member entity cards. Members exclude forge drafts (render in
// their forge chat). worldExpanded drives each member card's summary; the
// chevron collapses this thread's own member list independently.

import { useSlice } from "../../bridge";
import { T, SP } from "../../style";
import { useTapGuard } from "../../tap-guard";
import { store, groupDeleted, uiEditableActivate } from "../../../core/store";
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

export function ThreadItem(props: { groupId: string }) {
  const { groupId } = props;
  const group = useSlice((s) => s.world.groups.find((g) => g.id === groupId));
  const entitiesById = useSlice((s) => s.world.entitiesById);
  const [collapsed, setCollapsed] = useState(false);
  // Boolean flip: an unguarded repeat click from one tap re-collapses the
  // thread. Declared above the early return — hooks must run unconditionally.
  const onceCollapseTap = useTapGuard();

  if (!group) return null;

  const memberIds = group.entityIds.filter((id) => {
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
          onClick={() => onceCollapseTap(() => setCollapsed((c) => !c))}
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
          onClick={() => store.dispatch(uiEditableActivate({ id: groupId }))}
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
          {group.title || "New Thread"}
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
          onConfirm={() => store.dispatch(groupDeleted({ groupId }))}
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
            <EntityCard key={`${groupId}:${id}`} entityId={id} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
