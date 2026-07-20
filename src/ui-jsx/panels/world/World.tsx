// World section: header (World + globe, section-collapse, expand/collapse-all,
// SEGA start/stop, disabled add-entity/add-thread, clear-confirm) + body
// (Threads then loose entity cards). Body recomputed in render via
// selectWorldBody from store-owned refs. Creation + editing are deferred, so
// add-entity/add-thread render disabled.

import { useSlice } from "../../bridge";
import { T, SP } from "../../style";
import {
  store,
  segaToggled,
  worldExpansionSet,
  worldCleared,
  entityForged,
  uiEditableActivate,
} from "../../../core/store";
import { FieldID } from "../../../config/field-definitions";
import { selectWorldBody } from "./world-select";
import { ThreadItem } from "./ThreadItem";
import { EntityCard } from "./EntityCard";
import { ConfirmButton } from "../../components/ConfirmButton";
import {
  Globe,
  Layers,
  Plus,
  PlayCircle,
  FastForward,
  Minimize2,
  Maximize2,
} from "nai:icons/feather";

const ICON_SIZE = 16;
const ICON_BTN = {
  background: "none",
  border: "none",
  cursor: "pointer",
  opacity: 0.6,
} as const;
const DISABLED_BTN = {
  background: "none",
  border: "none",
  cursor: "default",
  opacity: 0.35,
} as const;

export function World() {
  const entitiesById = useSlice((s) => s.world.entitiesById);
  const groups = useSlice((s) => s.world.groups);
  const worldExpanded = useSlice((s) => s.ui.worldExpanded ?? true);
  const segaRunning = useSlice((s) => s.runtime.segaRunning);
  const [collapsed, setCollapsed] = useState(false);

  const { groups: visibleGroups, loose } = selectWorldBody(
    entitiesById,
    groups,
  );
  const isEmpty = visibleGroups.length === 0 && loose.length === 0;

  const onAddEntity = () => {
    const id = api.v1.uuid();
    store.dispatch(
      entityForged({
        entity: {
          id,
          categoryId: FieldID.DramatisPersonae,
          name: "",
          summary: "",
          lifecycle: "draft",
        },
      }),
    );
    store.dispatch(uiEditableActivate({ id }));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SP.sm }}>
      <div style={{ display: "flex", alignItems: "center", gap: SP.sm }}>
        <button
          onClick={() => setCollapsed((c) => !c)}
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            gap: SP.sm,
            background: "none",
            border: "none",
            cursor: "pointer",
            color: T.textHeadings,
            padding: 0,
          }}
        >
          <Globe size={ICON_SIZE} />
          <span style={{ fontWeight: "bold" }}>World</span>
        </button>
        <button
          title={worldExpanded ? "Collapse all" : "Expand all"}
          onClick={() =>
            store.dispatch(worldExpansionSet({ expanded: !worldExpanded }))
          }
          style={ICON_BTN}
        >
          {worldExpanded ? (
            <Minimize2 size={ICON_SIZE} />
          ) : (
            <Maximize2 size={ICON_SIZE} />
          )}
        </button>
        <button
          title="S.E.G.A."
          onClick={() => store.dispatch(segaToggled())}
          style={{ ...ICON_BTN, color: segaRunning ? T.warning : T.text }}
        >
          {segaRunning ? (
            <FastForward size={ICON_SIZE} />
          ) : (
            <PlayCircle size={ICON_SIZE} />
          )}
        </button>
        <button title="Add entity" onClick={onAddEntity} style={ICON_BTN}>
          <Plus size={ICON_SIZE} />
        </button>
        <button title="Add thread (coming soon)" disabled style={DISABLED_BTN}>
          <Layers size={ICON_SIZE} />
        </button>
        <ConfirmButton
          title="Clear world"
          onConfirm={() => store.dispatch(worldCleared())}
        />
      </div>

      {!collapsed ? (
        <div style={{ display: "flex", flexDirection: "column", gap: SP.xs }}>
          {visibleGroups.map((g) => (
            <ThreadItem key={g.id} groupId={g.id} />
          ))}
          {loose.map((e) => (
            <EntityCard key={e.id} entityId={e.id} />
          ))}
          {isEmpty ? (
            <div
              style={{
                color: T.textDisabled,
                fontSize: "0.85em",
                padding: SP.sm,
              }}
            >
              No world entities yet.
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
