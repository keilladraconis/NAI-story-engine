// EntityEditPane — static entity editor (editing half of SUI SeEntityEditPane).
// Category, name, summary, lorebook content, keys, Always-On, Delete, Save.
// Save promotes a draft to a live lorebook entry, propagates a name change into
// other entities' summaries, and flushes content/keys/always-on to the lorebook.
// The 3 generate buttons stream into the pane (unsolved in JSX) and render
// disabled; the card's regen bolt already generates for live entities. Content
// is the one that adapts: blank content generates (⚡), populated content opens a
// refine (quill), decided by the same decideFieldAction the Foundation cards use.

import { useSlice, useStream } from "../../bridge";
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
  uiEntitySummaryGenerationRequested,
  uiLorebookEntrySelected,
  uiLorebookContentGenerationRequested,
  uiLorebookKeysGenerationRequested,
  uiChatRefineRequested,
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
import { clearStream } from "../../../core/store/stream-buffer";
import {
  EDIT_PANE_TITLE,
  EDIT_PANE_CONTENT,
  entitySummaryRequestId,
  lorebookContentRequestId,
  lorebookKeysRequestId,
} from "../../../core/keys";
import { isRequestActive } from "./world-select";
import { ConfirmButton } from "../../components/ConfirmButton";
import { GenerateButton } from "../../components/GenerateButton";
import { decideFieldAction } from "../chat/chat-actions";
import {
  ArrowLeft,
  User,
  Cpu,
  MapPin,
  Shield,
  Activity,
  Hash,
} from "nai:icons/feather";

const ICON_SIZE = 16;

// Edit-pane draft slots the generation factories read (resolveDisplayName,
// createEntitySummaryFactory). The pane mirrors its local name/summary drafts
// into these so generation targets THIS entity's current name/summary, not a
// stale value left by a prior edit. Shared with the core strategies via keys.ts.
const EDIT_PANE_TITLE_KEY = EDIT_PANE_TITLE;
const EDIT_PANE_CONTENT_KEY = EDIT_PANE_CONTENT;

export const CATEGORIES: {
  id: DulfsFieldID;
  label: string;
  Icon: typeof User;
}[] = [
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

// Shared generate-field wiring: pending (isRequestActive), live stream display,
// and a genRef-guarded transfer of the final buffered text into the editable
// draft on completion. `arm` is the field-specific dispatch (Summary dispatches
// directly; Content/Keys promote + select first). requestId/bufferKey are "" when
// not yet available (a draft with no lorebook entry), so the field isn't pending
// and the button stays clickable.
function useGenField(opts: {
  requestId: string;
  bufferKey: string;
  draft: { value: string; setValue: (v: string) => void };
  arm: () => void;
}): { pending: boolean; live: string | undefined; onGenerate: () => void } {
  const pending = useSlice((s) =>
    opts.requestId ? isRequestActive(s.runtime, opts.requestId) : false,
  );
  const live = useStream(opts.bufferKey);
  const genRef = useRef(false);

  // Wipe a stale buffer on open / when the key changes post-promotion; clean up
  // on unmount.
  useEffect(() => {
    if (opts.bufferKey) clearStream(opts.bufferKey);
    return () => {
      if (opts.bufferKey) clearStream(opts.bufferKey);
    };
  }, [opts.bufferKey]);

  // Stage the final into the editable draft when a pane-triggered generation
  // finishes. genRef guards mount/stale/foreign completions; [pending, live] deps
  // make it order-independent (fires once the request has cleared and the final
  // is in the buffer; on failure the handler cleared it, so nothing stages).
  useEffect(() => {
    if (!genRef.current || pending) return;
    if (live !== undefined) opts.draft.setValue(live);
    if (opts.bufferKey) clearStream(opts.bufferKey);
    genRef.current = false;
  }, [pending, live]);

  const onGenerate = () => {
    // genRef.current guards the promotion window: during `await ensureLiveEntryId`
    // `pending` is still false, so without it a double-click could create two
    // lorebook entries (the second orphaning the first).
    if (pending || genRef.current) return;
    genRef.current = true;
    if (opts.bufferKey) clearStream(opts.bufferKey);
    opts.arm();
  };

  return { pending, live, onGenerate };
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
  // Save and the content Zap's refine branch both promote a draft, which is a
  // multi-await sequence: without this, a second press landing mid-flight mints
  // a second lorebook entry and strands the first.
  const flushingRef = useRef(false);

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

  // Mirror the name/summary drafts into the SUI storyStorage slots the generation
  // factories read, so generation uses THIS entity's current name/summary.
  useEffect(() => {
    void api.v1.storyStorage.set(EDIT_PANE_TITLE_KEY, name.value);
  }, [name.value]);
  useEffect(() => {
    void api.v1.storyStorage.set(EDIT_PANE_CONTENT_KEY, summary.value);
  }, [summary.value]);

  const summaryGen = useGenField({
    requestId: entitySummaryRequestId(entityId),
    bufferKey: `entity-summary:${entityId}`,
    draft: summary,
    arm: () =>
      store.dispatch(
        uiEntitySummaryGenerationRequested({
          entityId,
          requestId: entitySummaryRequestId(entityId),
        }),
      ),
  });

  // Request ids key by entityId (shared with the card regen + SEGA); buffer keys
  // key by the lorebook entry id (where the handlers stream). Buffer keys are ""
  // for a not-yet-promoted draft so no stale stream shows; the entity-keyed
  // request id is stable across promotion, so pending tracks correctly the moment
  // the entry exists.
  const eid = entity?.lorebookEntryId ?? "";
  const contentGen = useGenField({
    requestId: eid ? lorebookContentRequestId(entityId) : "",
    bufferKey: eid ? `lb-content:${eid}` : "",
    draft: content,
    arm: () =>
      void (async () => {
        const liveId = await ensureLiveEntryId(entityId);
        if (!liveId) return;
        store.dispatch(
          uiLorebookEntrySelected({ entryId: liveId, categoryId: null }),
        );
        store.dispatch(
          uiLorebookContentGenerationRequested({
            requestId: lorebookContentRequestId(entityId),
          }),
        );
      })(),
  });
  const keysGen = useGenField({
    requestId: eid ? lorebookKeysRequestId(entityId) : "",
    bufferKey: eid ? `lb-keys:${eid}` : "",
    draft: keys,
    arm: () =>
      void (async () => {
        const liveId = await ensureLiveEntryId(entityId);
        if (!liveId) return;
        store.dispatch(
          uiLorebookEntrySelected({ entryId: liveId, categoryId: null }),
        );
        store.dispatch(
          uiLorebookKeysGenerationRequested({
            requestId: lorebookKeysRequestId(entityId),
          }),
        );
      })(),
  });

  // Release the shared lorebook selection when the pane closes.
  useEffect(
    () => () =>
      store.dispatch(
        uiLorebookEntrySelected({ entryId: null, categoryId: null }),
      ),
    [],
  );

  if (!entity) return null;

  const close = () => store.dispatch(uiEditableDeactivate());

  const onCategory = (id: DulfsFieldID) => {
    setCategory(id);
    store.dispatch(entityCategoryChanged({ entityId, categoryId: id }));
  };

  // Commit the pane's current edits to the store + lorebook (the Save body
  // without closing). Returns the live lorebook entry id (promoting a draft if
  // needed). Used by Save and by content-refine (which must persist drafts
  // before the Chat tab unmounts this pane).
  //
  // Re-entrancy flag, for the same reason useGenField carries one: promoting a
  // draft goes through `await ensureLiveEntryId`, and during that await the
  // entity still has no lorebookEntryId — so a second flush landing in the gap
  // creates a SECOND lorebook entry and binds over the first, orphaning it in
  // the user's lorebook. The window is as long as a category lookup plus an
  // entry create, well past what a tap guard covers. Refusing returns undefined,
  // which is also what callers do when there is no live entry to act on.
  const flushToStore = async (): Promise<string | undefined> => {
    if (flushingRef.current) return undefined;
    flushingRef.current = true;
    try {
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
      return liveId;
    } finally {
      flushingRef.current = false;
    }
  };

  const onSave = () => {
    void (async () => {
      await flushToStore();
      close();
    })();
  };

  // Populated-content Zap: flush the pane (persist name/summary/content/keys and
  // promote a draft), then open the refine chat on the entry's lorebook content.
  // Switching to the Chat tab unmounts this pane along with the rest of Engine;
  // on return it remounts and re-seeds the refined content from the lorebook (no
  // stale clobber).
  const onRefineContent = () => {
    void (async () => {
      const liveId = await flushToStore();
      if (!liveId) return;
      store.dispatch(
        uiChatRefineRequested({
          fieldId: "lorebookContent",
          sourceText: content.value,
          entryId: liveId,
        }),
      );
    })();
  };

  // One decision for the content button's glyph, tooltip and handler, so the
  // quill can never sit over a generate dispatch (or vice versa).
  const contentMode = decideFieldAction(content.value);

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
        // Fill the pane height so the Content textarea can grow to the bottom
        // (Keys pinned below it). Grows past the panel if the fields are tall
        // (the engine tab scrolls); the textarea scrolls its own overflow.
        minHeight: "100%",
        paddingBottom: SP.sm,
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
        <GenerateButton
          mode="generate"
          title="Generate summary"
          pending={summaryGen.pending}
          size={ICON_SIZE}
          onClick={summaryGen.onGenerate}
        />
      </div>
      <textarea
        placeholder="Brief description of this entity…"
        rows={4}
        disabled={summaryGen.pending}
        value={summaryGen.live ?? summary.value}
        onInput={(e) => summary.setValue(e.target.value ?? "")}
        style={{ ...inputStyle, resize: "vertical" }}
      />

      {/* Lorebook section — grows to fill the pane so the content textarea can
          expand, with Keys held at the bottom. */}
      <div
        style={{
          marginTop: SP.sm,
          borderTop: `1px solid ${T.bg3}`,
          paddingTop: SP.sm,
          display: "flex",
          flexDirection: "column",
          gap: SP.sm,
          flex: 1,
          minHeight: 0,
        }}
      >
        <div style={sectionRow}>
          <span style={sectionLabel}>Content</span>
          <GenerateButton
            mode={contentMode}
            title="Generate content"
            // `pending` does not cover the refine branch — contentGen.pending
            // only goes true on the generate branch, so refine is never dimmed.
            pending={contentGen.pending}
            disabled={loading || contentGen.pending}
            size={ICON_SIZE}
            onClick={
              contentMode === "refine" ? onRefineContent : contentGen.onGenerate
            }
          />
        </div>
        <textarea
          placeholder="Lorebook content…"
          disabled={loading || contentGen.pending}
          value={contentGen.live ?? content.value}
          onInput={(e) => content.setValue(e.target.value ?? "")}
          // flex:1 fills the section down to Keys; minHeight keeps it usable when
          // the pane is short; the textarea scrolls its own overflow.
          style={{ ...inputStyle, flex: 1, minHeight: "8em", resize: "none" }}
        />
        <div style={sectionRow}>
          <span style={{ ...sectionLabel, flex: "none" }}>Keys</span>
          <input
            placeholder="comma, separated, keys"
            disabled={loading || keysGen.pending}
            value={keysGen.live ?? keys.value}
            onInput={(e) => keys.setValue(e.target.value ?? "")}
            style={{ ...inputStyle, flex: 1 }}
          />
          <GenerateButton
            mode="generate"
            title="Generate keys"
            pending={keysGen.pending}
            size={ICON_SIZE}
            onClick={keysGen.onGenerate}
          />
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
