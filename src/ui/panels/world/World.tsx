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
// **add-thread shows the open count against the Engine's limit and never
// refuses.** The limit restrains the Engine's admissions only; a writer who has
// pressed the button has chosen, so the press always creates. The count is
// there so a writer at the limit knows why the Engine has stopped proposing
// Threads. `threadAddModel` (thread-display.ts) owns both readings.

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
import { partitionThreads, selectWorldBody } from "./world-select";
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
  ChevronDown,
  ChevronRight,
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

  const { threads: allThreads, loose } = selectWorldBody(entitiesById, threads);
  const { open: openThreads, concluded: concludedThreads } =
    partitionThreads(allThreads);
  const [concludedOpen, setConcludedOpen] = useState(false);
  const isEmpty = allThreads.length === 0 && loose.length === 0;
  const addThread = threadAddModel(openThreads.length, threadCap);

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
      threadCreated({ thread: { id, title: "", state: "", entityIds: [] } }),
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
          onClick={onAddThread}
          style={{
            ...ICON_BTN,
            display: "flex",
            alignItems: "center",
            gap: SP.xs,
            color: T.text,
            opacity: 0.6,
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
          {loose.map((e) => (
            <EntityCard key={e.id} entityId={e.id} />
          ))}

          {/* Threads are a section beside the World, not a grouping of it. They
              used to wrap their cast, which hid those entities from the list
              above and made a thread the only way to reach them. A thread's
              cast is who has to be on stage for its entry to activate
              (thread-condition.ts), which is a different job from filing. */}
          {allThreads.length > 0 ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: SP.xs,
                marginTop: SP.sm,
                paddingTop: SP.sm,
                borderTop: `1px solid ${T.bg2}`,
              }}
            >
              {openThreads.map((t) => (
                <ThreadItem key={t.id} threadId={t.id} />
              ))}

              {/* Concluded threads fold rather than vanish. They accumulate,
                  and twenty finished rows bury the three still in play — but
                  reopening one means finding it first, so they stay one click
                  away. */}
              {concludedThreads.length > 0 ? (
                <Fragment>
                  <button
                    onClick={() => setConcludedOpen(!concludedOpen)}
                    title="Threads that have settled; their entries are switched off"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: SP.sm,
                      alignSelf: "flex-start",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: T.textDisabled,
                      fontFamily: T.fontDefault,
                      fontSize: "0.85em",
                      padding: 0,
                    }}
                  >
                    {/* Both chevrons mounted, `display` picks: this list
                        re-renders from a store subscription, where swapping one
                        component type for another at a fixed position leaves
                        the old svg behind. */}
                    <ChevronDown
                      size={14}
                      style={{
                        display: concludedOpen ? "inline-flex" : "none",
                      }}
                    />
                    <ChevronRight
                      size={14}
                      style={{
                        display: concludedOpen ? "none" : "inline-flex",
                      }}
                    />
                    Concluded ({concludedThreads.length})
                  </button>
                  <div
                    style={{
                      display: concludedOpen ? "flex" : "none",
                      flexDirection: "column",
                      gap: SP.xs,
                    }}
                  >
                    {concludedThreads.map((t) => (
                      <ThreadItem key={t.id} threadId={t.id} />
                    ))}
                  </div>
                </Fragment>
              ) : null}
            </div>
          ) : null}
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
