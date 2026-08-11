// One entity card: category icon + name (click → edit pane) + collapsible summary
// (follows ui.worldExpanded) + status border (draft/pending/complete/incomplete).
// Live cards show a regen bolt that dims while pending; draft cards show discard.

import { useSlice } from "../../bridge";
import { T, SP } from "../../style";
import {
  store,
  entityDiscardRequested,
  uiEditableActivate,
} from "../../../core/store";
import { entityRegenRequested } from "../../../core/store/effects/summary-generation";
import {
  entityPending,
  entityBorderKind,
  type BorderKind,
} from "./world-select";
import { ConfirmButton } from "../../components/ConfirmButton";
import { useTapGuard } from "../../tap-guard";
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
  if (kind === "complete") return T.midIntensity;
  return T.textDisabled;
}

export function EntityCard(props: { entityId: string }) {
  const { entityId } = props;
  const entity = useSlice((s) => s.world.entitiesById[entityId]);
  const worldExpanded = useSlice((s) => s.ui.worldExpanded ?? true);
  const pending = useSlice((s) => entityPending(s.runtime, entityId));
  const onceRegenTap = useTapGuard();

  const [complete, setComplete] = useState(false);

  // Green "complete" needs a lorebook read (text + keys). Re-fetch when the
  // entity object changes (a Save produces a new object) or a regen settles.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const eid = entity?.lorebookEntryId;
      if (!entity || entity.lifecycle === "draft" || !eid) {
        if (!cancelled) setComplete(false);
        return;
      }
      const entry = await api.v1.lorebook.entry(eid);
      const keysOk =
        !!entry?.forceActivation || !!(entry?.keys && entry.keys.length > 0);
      if (!cancelled) {
        setComplete(!!entity.summary && !!entry?.text && keysOk);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entity, pending]);

  if (!entity) return null;

  const kind = entityBorderKind(entity, pending, complete);
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
        <button
          title="Edit entity"
          onClick={() => store.dispatch(uiEditableActivate({ id: entityId }))}
          style={{
            flex: 1,
            textAlign: "left",
            background: "none",
            border: "none",
            cursor: "pointer",
            color: T.text,
            padding: 0,
            font: "inherit",
          }}
        >
          {entity.name || "(unnamed)"}
        </button>
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
            // `pending` is a render-time value, so the repeat click of a doubled
            // tap reads it before the re-render that would flip it — the tap
            // guard is what actually stops the second dispatch here. The regen
            // effect refuses ids it has already queued as the real backstop.
            onClick={() =>
              onceRegenTap(() => {
                if (!pending)
                  store.dispatch(entityRegenRequested({ entityId }));
              })
            }
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
