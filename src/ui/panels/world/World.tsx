// World section: header (World + globe, section-collapse, expand/collapse-all,
// SEGA start/stop, add-entity, add-thread, clear-confirm) + body
// (Threads then loose entity cards). Body recomputed in render via
// selectWorldBody from store-owned refs. add-entity creates a draft and opens
// the edit pane; add-thread creates an empty group and opens ThreadEditPane.

import { useSlice } from "../../bridge";
import { T, SP } from "../../style";
import { useTapGuard } from "../../tap-guard";
import {
  store,
  segaToggled,
  worldExpansionSet,
  worldCleared,
  entityForged,
  uiEditableActivate,
  groupCreated,
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

export function World() {
  const entitiesById = useSlice((s) => s.world.entitiesById);
  const groups = useSlice((s) => s.world.groups);
  const worldExpanded = useSlice((s) => s.ui.worldExpanded ?? true);
  const segaRunning = useSlice((s) => s.runtime.segaRunning);
  const [collapsed, setCollapsed] = useState(false);

  // Each of these flips a boolean, so an unguarded repeat click from one tap
  // flips it straight back. SEGA is the worst of the three: start-then-stop
  // from a single tap. One guard each — a shared guard would let a tap on the
  // section header swallow the next tap on expand-all.
  const onceCollapseTap = useTapGuard();
  const onceExpandAllTap = useTapGuard();
  const onceSegaTap = useTapGuard();

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

  const onAddThread = () => {
    const id = api.v1.uuid();
    store.dispatch(
      groupCreated({ group: { id, title: "", summary: "", entityIds: [] } }),
    );
    store.dispatch(uiEditableActivate({ id }));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SP.sm }}>
      <div style={{ display: "flex", alignItems: "center", gap: SP.sm }}>
        <button
          onClick={() => onceCollapseTap(() => setCollapsed((c) => !c))}
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
            onceExpandAllTap(() =>
              store.dispatch(worldExpansionSet({ expanded: !worldExpanded })),
            )
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
          onClick={() => onceSegaTap(() => store.dispatch(segaToggled()))}
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
        <button title="Add thread" onClick={onAddThread} style={ICON_BTN}>
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
