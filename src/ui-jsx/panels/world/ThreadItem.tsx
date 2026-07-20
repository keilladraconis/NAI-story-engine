// One Thread card: layers icon + title (non-interactive — edit deferred) +
// disabled lorebook toggle (deferred) + immediate delete + member entity cards.
// Members exclude forge drafts (they render in their forge chat). worldExpanded
// drives each member card's summary; the member list itself always shows.

import { useSlice } from "../../bridge";
import { T, SP } from "../../style";
import { store, groupDeleted } from "../../../core/store";
import { isForgeDraft } from "../../../core/store/selectors/forge";
import { EntityCard } from "./EntityCard";
import { Layers, Trash2, ToggleLeft } from "nai:icons/feather";

const ICON_SIZE = 16;

export function ThreadItem(props: { groupId: string }) {
  const { groupId } = props;
  const group = useSlice((s) => s.world.groups.find((g) => g.id === groupId));
  const entitiesById = useSlice((s) => s.world.entitiesById);

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
        <Layers size={ICON_SIZE} />
        <span style={{ flex: 1, color: T.textHeadings }}>
          {group.title || "New Thread"}
        </span>
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
        <button
          title="Delete thread"
          onClick={() => store.dispatch(groupDeleted({ groupId }))}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            opacity: 0.6,
          }}
        >
          <Trash2 size={ICON_SIZE} />
        </button>
      </div>
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
    </div>
  );
}
