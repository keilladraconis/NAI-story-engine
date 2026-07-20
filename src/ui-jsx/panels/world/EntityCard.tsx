// One entity card: category icon + name (non-interactive — edit deferred) +
// collapsible summary (follows ui.worldExpanded) + store-only status border.
// Live cards show a regen bolt that dims while pending; draft cards show a
// discard confirm. Name-click editing and the green "complete" border are
// deferred to the entity-edit slice.

import { useSlice } from "../../bridge";
import { T, SP } from "../../style";
import { store, entityDiscardRequested } from "../../../core/store";
import { entityRegenRequested } from "../../../core/store/effects/summary-generation";
import {
  entityPending,
  entityBorderKind,
  type BorderKind,
} from "./world-select";
import { ConfirmButton } from "../../components/ConfirmButton";
import {
  User,
  Cpu,
  MapPin,
  Shield,
  Activity,
  Hash,
  Zap,
} from "nai:icons/feather";

const ICON_SIZE = 16;

// All feather icons share one component type; deriving from `User` keeps the map
// values valid JSX elements (a `(props) => unknown` type would fail `<Icon/>`).
const CATEGORY_ICON: Record<string, typeof User> = {
  dramatisPersonae: User,
  universeSystems: Cpu,
  locations: MapPin,
  factions: Shield,
  situationalDynamics: Activity,
  topics: Hash,
};

function borderColor(kind: BorderKind): string {
  if (kind === "draft") return T.lowIntensity;
  if (kind === "pending") return T.warning;
  return T.textDisabled;
}

export function EntityCard(props: { entityId: string }) {
  const { entityId } = props;
  const entity = useSlice((s) => s.world.entitiesById[entityId]);
  const worldExpanded = useSlice((s) => s.ui.worldExpanded ?? true);
  const pending = useSlice((s) => entityPending(s.runtime, entityId));

  if (!entity) return null;

  const kind = entityBorderKind(entity, pending);
  const Icon = CATEGORY_ICON[entity.categoryId];
  const isDraft = entity.lifecycle === "draft";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        borderLeft: `2px solid ${borderColor(kind)}`,
        borderRadius: "2px",
        paddingLeft: SP.sm,
        background: T.bg2,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: SP.sm,
          padding: SP.sm,
        }}
      >
        {Icon ? <Icon size={ICON_SIZE} /> : null}
        <span style={{ flex: 1, color: T.text }}>
          {entity.name || "(unnamed)"}
        </span>
        {isDraft ? (
          <ConfirmButton
            title="Discard entity"
            onConfirm={() =>
              store.dispatch(entityDiscardRequested({ entityId }))
            }
          />
        ) : (
          <button
            title={pending ? "Generating…" : "Generate"}
            disabled={pending}
            onClick={() => {
              if (!pending) store.dispatch(entityRegenRequested({ entityId }));
            }}
            style={{
              background: "none",
              border: "none",
              cursor: pending ? "default" : "pointer",
              opacity: pending ? 0.4 : 1,
            }}
          >
            <Zap size={ICON_SIZE} />
          </button>
        )}
      </div>
      {worldExpanded && entity.summary ? (
        <div
          style={{
            fontSize: "0.82em",
            opacity: 0.7,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            padding: "0 8px 4px",
            color: T.text,
          }}
        >
          {entity.summary}
        </div>
      ) : null}
    </div>
  );
}
