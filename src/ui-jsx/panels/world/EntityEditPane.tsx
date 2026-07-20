// EntityEditPane — static entity editor (editing half of SUI SeEntityEditPane).
// Category, name, summary, lorebook content, keys, Always-On, Delete, Save.
// Save promotes a draft to a live lorebook entry, propagates a name change into
// other entities' summaries, and flushes content/keys/always-on to the lorebook.
// The 3 generate zap buttons stream into the pane (unsolved in JSX) and render
// disabled; the card's regen bolt already generates for live entities.

import { useSlice } from "../../bridge";
import { useDraftField } from "../../hooks";
import { T, SP } from "../../style";
import {
  store,
  entityEdited,
  entityCategoryChanged,
  entityLorebookEntryBound,
  entitySummaryUpdated,
  entityDeleted,
  uiEditableDeactivate,
} from "../../../core/store";
import { ensureCategory } from "../../../core/store/effects/lorebook-sync";
import {
  nameKey,
  withNameKeyFirst,
} from "../../../core/store/effects/handlers/lorebook";
import { FieldID, type DulfsFieldID } from "../../../config/field-definitions";
import {
  parseKeys,
  applyEratoPrefix,
  propagateNameInSummaries,
} from "./entity-edit";
import { ConfirmButton } from "../../components/ConfirmButton";
import {
  ArrowLeft,
  Zap,
  User,
  Cpu,
  MapPin,
  Shield,
  Activity,
  Hash,
} from "nai:icons/feather";

const ICON_SIZE = 16;

const CATEGORIES: { id: DulfsFieldID; label: string; Icon: typeof User }[] = [
  { id: FieldID.DramatisPersonae, label: "Characters", Icon: User },
  { id: FieldID.UniverseSystems, label: "Systems", Icon: Cpu },
  { id: FieldID.Locations, label: "Locations", Icon: MapPin },
  { id: FieldID.Factions, label: "Factions", Icon: Shield },
  { id: FieldID.SituationalDynamics, label: "Vectors", Icon: Activity },
  { id: FieldID.Topics, label: "Topics", Icon: Hash },
];

const inputStyle = {
  background: T.bg2,
  color: T.text,
  fontFamily: T.fontDefault,
  padding: SP.md,
  border: "none",
} as const;
const sectionRow = {
  display: "flex",
  alignItems: "center",
  gap: SP.sm,
} as const;
const sectionLabel = {
  flex: 1,
  fontSize: "0.8em",
  fontWeight: "bold",
  color: T.textHeadings,
} as const;
const disabledZap = {
  background: "none",
  border: "none",
  cursor: "default",
  opacity: 0.35,
} as const;

/** Resolve, or create+bind, the lorebook entry for this entity. Idempotent —
 *  returns the existing id for live entities, lazily promotes drafts. */
async function ensureLiveEntryId(
  entityId: string,
): Promise<string | undefined> {
  const existing =
    store.getState().world.entitiesById[entityId]?.lorebookEntryId;
  if (existing) return existing;
  const current = store.getState().world.entitiesById[entityId];
  if (!current) return undefined;
  const categoryId = await ensureCategory(current.categoryId);
  const newEntryId = api.v1.uuid();
  await api.v1.lorebook.createEntry({
    id: newEntryId,
    displayName: current.name,
    text: "",
    keys: current.name ? [nameKey(current.name)] : [],
    enabled: true,
    category: categoryId,
  });
  store.dispatch(
    entityLorebookEntryBound({ entityId, lorebookEntryId: newEntryId }),
  );
  return newEntryId;
}

export function EntityEditPane(props: { entityId: string }) {
  const { entityId } = props;
  const entity = useSlice((s) => s.world.entitiesById[entityId]);

  const name = useDraftField(entity?.name ?? "");
  const summary = useDraftField(entity?.summary ?? "");
  const content = useDraftField("");
  const keys = useDraftField("");
  const [alwaysOn, setAlwaysOn] = useState(false);
  const [category, setCategory] = useState<string>(
    entity?.categoryId ?? FieldID.DramatisPersonae,
  );
  const [loading, setLoading] = useState(true);

  // Seed lorebook content/keys/always-on from the entry once, on open.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const eid =
        store.getState().world.entitiesById[entityId]?.lorebookEntryId;
      if (eid) {
        const entry = await api.v1.lorebook.entry(eid);
        if (!cancelled && entry) {
          content.setValue(entry.text ?? "");
          keys.setValue(entry.keys?.join(", ") ?? "");
          setAlwaysOn(entry.forceActivation ?? false);
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!entity) return null;

  const close = () => store.dispatch(uiEditableDeactivate());

  const onCategory = (id: DulfsFieldID) => {
    setCategory(id);
    store.dispatch(entityCategoryChanged({ entityId, categoryId: id }));
  };

  const onSave = () => {
    void (async () => {
      const newName = name.value.trim() || entity.name;
      const newSummary = summary.value.trim();
      const oldName = entity.name;
      store.dispatch(
        entityEdited({ entityId, name: newName, summary: newSummary }),
      );

      for (const u of propagateNameInSummaries(
        Object.values(store.getState().world.entitiesById),
        entityId,
        oldName,
        newName,
      )) {
        store.dispatch(
          entitySummaryUpdated({ entityId: u.entityId, summary: u.summary }),
        );
      }

      const liveId = await ensureLiveEntryId(entityId);
      if (liveId) {
        const erato = (await api.v1.config.get("erato_compatibility")) || false;
        await api.v1.lorebook.updateEntry(liveId, {
          displayName: newName,
          text: applyEratoPrefix(content.value, !!erato),
          keys: withNameKeyFirst(parseKeys(keys.value), newName),
          forceActivation: alwaysOn,
        });
      }
      close();
    })();
  };

  const onDelete = () => {
    store.dispatch(entityDeleted({ entityId }));
    close();
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: SP.sm,
        paddingBottom: "32px",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: SP.sm }}>
        <button
          title="Back"
          onClick={close}
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
          <ArrowLeft size={ICON_SIZE} />
        </button>
        <span style={{ flex: 1, color: T.textHeadings, fontWeight: "bold" }}>
          {name.value || "(unnamed)"}
        </span>
        <ConfirmButton
          title="Delete entity"
          label="Delete"
          onConfirm={onDelete}
        />
        <button onClick={onSave} style={{ padding: "4px 16px" }}>
          Save
        </button>
      </div>

      {/* Category bar */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: SP.sm }}>
        {CATEGORIES.map((cat) => {
          const selected = cat.id === category;
          return (
            <button
              key={cat.id}
              onClick={() => onCategory(cat.id)}
              style={{
                border: "none",
                cursor: "pointer",
                padding: "4px 8px",
                fontSize: "0.775rem",
                borderRadius: "3px",
                display: "flex",
                alignItems: "center",
                gap: SP.xs,
                background: selected ? T.bg3 : "transparent",
                color: selected ? T.textHeadings : T.textDisabled,
                opacity: selected ? 1 : 0.5,
              }}
            >
              <cat.Icon size={ICON_SIZE} />
              {cat.label}
            </button>
          );
        })}
      </div>

      {/* Name */}
      <input
        placeholder="Entity name…"
        value={name.value}
        onInput={(e) => name.setValue(e.target.value ?? "")}
        style={inputStyle}
      />

      {/* Summary */}
      <div style={sectionRow}>
        <span style={sectionLabel}>Summary</span>
        <button title="Generate (coming soon)" disabled style={disabledZap}>
          <Zap size={ICON_SIZE} />
        </button>
      </div>
      <textarea
        placeholder="Brief description of this entity…"
        rows={4}
        value={summary.value}
        onInput={(e) => summary.setValue(e.target.value ?? "")}
        style={{ ...inputStyle, resize: "vertical" }}
      />

      {/* Lorebook section */}
      <div
        style={{
          marginTop: SP.sm,
          borderTop: `1px solid ${T.bg3}`,
          paddingTop: SP.sm,
          display: "flex",
          flexDirection: "column",
          gap: SP.sm,
        }}
      >
        <div style={sectionRow}>
          <span style={sectionLabel}>Content</span>
          <button title="Generate (coming soon)" disabled style={disabledZap}>
            <Zap size={ICON_SIZE} />
          </button>
        </div>
        <textarea
          placeholder="Lorebook content…"
          rows={6}
          disabled={loading}
          value={content.value}
          onInput={(e) => content.setValue(e.target.value ?? "")}
          style={{ ...inputStyle, resize: "vertical" }}
        />
        <div style={sectionRow}>
          <span style={{ ...sectionLabel, flex: "none" }}>Keys</span>
          <input
            placeholder="comma, separated, keys"
            disabled={loading}
            value={keys.value}
            onInput={(e) => keys.setValue(e.target.value ?? "")}
            style={{ ...inputStyle, flex: 1 }}
          />
          <button title="Generate (coming soon)" disabled style={disabledZap}>
            <Zap size={ICON_SIZE} />
          </button>
          <button
            title="Always On"
            onClick={() => setAlwaysOn((v) => !v)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: "11px",
              padding: "2px 6px",
              color: alwaysOn ? T.midIntensity : T.textDisabled,
              opacity: alwaysOn ? 1 : 0.5,
            }}
          >
            Always On
          </button>
        </div>
      </div>
    </div>
  );
}
