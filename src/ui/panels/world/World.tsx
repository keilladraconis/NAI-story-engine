// World section: header (World + globe, section-collapse, expand/collapse-all,
// SEGA start/stop, add-entity, add-thread, clear-confirm) + body
// (Threads then loose entity cards). Body recomputed in render via
// selectWorldBody from store-owned refs. add-entity creates a draft and opens
// the edit pane; add-thread creates an empty thread and opens ThreadEditPane.
//
// **Every icon variant stays mounted and toggles `display`.** Swapping one
// component type for another at a fixed position leaves both svgs in the DOM
// when the re-render arrives detached — and every condition on this row comes
// from `useSlice`, so every repaint here is detached: S.E.G.A. finishing turns
// its own icon back with no press anywhere near it. Same workaround as
// `ThreadStatusIcon`, `ConfirmButton` and `Header.tsx`'s WidgetIcon.
//
// **add-thread carries the cap, and refuses rather than displaces.** The
// reducer's `enforceThreadCap` drops the weakest thread to make room for a new
// one, which is the right trade for triage — the Engine chose to spend
// something — and the wrong one for a writer who has pressed a button and
// chosen nothing yet. So the button shows where the writer stands (`3/8`) on
// every render, and at the ceiling it says why it will not create and what to
// do about it, instead of silently eating an authored thread. `threadAddModel`
// (thread-display.ts) owns all three readings; the handler refuses on the same
// `enabled` the appearance reads, because `disabled` is a render-time value and
// not a guard (CLAUDE.md) — and the reducer stays the backstop underneath both.

import { useSlice } from "../../bridge";
import { T, SP } from "../../style";
import {
  store,
  segaToggled,
  worldExpansionSet,
  worldCleared,
  entityForged,
  uiEditableActivate,
  threadCreated,
} from "../../../core/store";
import { FieldID } from "../../../config/field-definitions";
import { selectWorldBody } from "./world-select";
import { threadAddModel } from "./thread-display";
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
  const threads = useSlice((s) => s.world.threads);
  const worldExpanded = useSlice((s) => s.ui.worldExpanded ?? true);
  const segaRunning = useSlice((s) => s.runtime.segaRunning);
  const threadCap = useSlice((s) => s.engine.settings.threadCap);
  const [collapsed, setCollapsed] = useState(false);

  const { threads: visibleThreads, loose } = selectWorldBody(
    entitiesById,
    threads,
  );
  const isEmpty = visibleThreads.length === 0 && loose.length === 0;
  // Every thread the cap counts, not just the ones this panel is showing:
  // `selectWorldBody` may hide a forge draft's thread, and the reducer counts
  // it all the same.
  const addThread = threadAddModel(threads.length, threadCap);

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
    // The refusal, where a press actually lands. Not `disabled`: that is a
    // render-time value a press arriving before the re-render slips past, and
    // a disabled button also swallows the hover that shows the tooltip saying
    // why (see the `aria-disabled` below).
    if (!addThread.enabled) return;
    const id = api.v1.uuid();
    store.dispatch(
      threadCreated({ thread: { id, title: "", text: "", entityIds: [] } }),
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
        {/* Both icons mounted, `display` picks — see the rule at the top of
            this file. `worldExpanded` is store state, so this row repaints from
            the subscription rather than from the click. */}
        <button
          title={worldExpanded ? "Collapse all" : "Expand all"}
          onClick={() =>
            store.dispatch(worldExpansionSet({ expanded: !worldExpanded }))
          }
          style={ICON_BTN}
        >
          <Minimize2
            size={ICON_SIZE}
            style={{ display: worldExpanded ? "inline-flex" : "none" }}
          />
          <Maximize2
            size={ICON_SIZE}
            style={{ display: worldExpanded ? "none" : "inline-flex" }}
          />
        </button>
        {/* Same again, and more so: S.E.G.A. finishing turns this icon back
            with no press anywhere near it. */}
        <button
          title="S.E.G.A."
          onClick={() => store.dispatch(segaToggled())}
          style={{ ...ICON_BTN, color: segaRunning ? T.warning : T.text }}
        >
          <FastForward
            size={ICON_SIZE}
            style={{ display: segaRunning ? "inline-flex" : "none" }}
          />
          <PlayCircle
            size={ICON_SIZE}
            style={{ display: segaRunning ? "none" : "inline-flex" }}
          />
        </button>
        <button title="Add entity" onClick={onAddEntity} style={ICON_BTN}>
          <Plus size={ICON_SIZE} />
        </button>
        <button
          title={addThread.title}
          aria-disabled={!addThread.enabled}
          onClick={onAddThread}
          style={{
            ...ICON_BTN,
            display: "flex",
            alignItems: "center",
            gap: SP.xs,
            color: addThread.enabled ? T.text : T.textDisabled,
            opacity: addThread.enabled ? 0.6 : 0.35,
          }}
        >
          <Layers size={ICON_SIZE} />
          <span style={{ fontSize: "0.75em" }}>{addThread.count}</span>
        </button>
        <ConfirmButton
          title="Clear world"
          onConfirm={() => store.dispatch(worldCleared())}
        />
      </div>

      {!collapsed ? (
        <div style={{ display: "flex", flexDirection: "column", gap: SP.xs }}>
          {visibleThreads.map((t) => (
            <ThreadItem key={t.id} threadId={t.id} />
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
