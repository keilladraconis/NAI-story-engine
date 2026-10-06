// ThreadEditPane — edit pane for a Thread, counterpart to EntityEditPane and
// SUI's SeThreadEditPane. Title, state and private notes are local drafts
// committed on Save (threadRenamed + threadLedgerUpdated); the state has a
// generate zap that streams into the draft via the shared stream-buffer.
// Membership toggles and the status control dispatch immediately (not part of
// the draft). No Delete (that lives on the ThreadItem card) and no lorebook
// toggle (a later slice) — matching SUI scope.
//
// **Drafted vs immediate is a split with a reason.** Title, state and notes are
// typed, so they draft locally and commit on Save — a dispatch per keystroke is
// reducer overhead for a value nobody has finished typing. The status and the
// membership toggles are presses: one press, one value, and the same split
// EntityEditPane already makes for its category bar.
//
// **Every intent carries its value.** `threadStatusSet` takes a status — never "next" or "toggle" — so a press
// delivered twice sets the same value twice. That is the idempotence CLAUDE.md
// asks for in place of the tap debounce it forbids, and `disabled` would not
// have covered it either (a render-time value the second press arrives ahead
// of).

import { useSlice, useStream } from "../../bridge";
import { useDraftField } from "../../hooks";
import { T, SP } from "../../style";
import {
  store,
  threadRenamed,
  threadLedgerUpdated,
  threadMemberToggled,
  threadStatusSet,
  uiThreadSummaryGenerationRequested,
  uiEditableDeactivate,
} from "../../../core/store";
import { isRequestActive } from "./world-select";
import { clearStream } from "../../../core/store/stream-buffer";
import { CATEGORIES } from "./EntityEditPane";
import { ThreadStatusIcon } from "./ThreadStatusIcon";
import { nextStatus, statusOption } from "./thread-display";
import { ArrowLeft, Zap, ToggleLeft, ToggleRight } from "nai:icons/feather";

const ICON_SIZE = 16;

const inputStyle = {
  background: T.bg2,
  color: T.text,
  fontFamily: T.fontDefault,
  padding: SP.md,
  border: "none",
} as const;
const sectionLabel = {
  fontSize: "0.8em",
  fontWeight: "bold",
  color: T.textHeadings,
} as const;
const genZapStyle = (pending: boolean) =>
  ({
    background: "none",
    border: "none",
    cursor: pending ? "default" : "pointer",
    opacity: pending ? 0.4 : 1,
  }) as const;

// One membership row.
function MemberToggle(props: {
  threadId: string;
  entityId: string;
  name: string;
  isMember: boolean;
}) {
  return (
    <button
      onClick={() =>
        store.dispatch(
          threadMemberToggled({
            threadId: props.threadId,
            entityId: props.entityId,
          }),
        )
      }
      style={{
        display: "flex",
        alignItems: "center",
        gap: SP.sm,
        background: T.bg2,
        border: "none",
        cursor: "pointer",
        // Icons inherit this via SVG currentColor — the codebase
        // passes only `size` to feather icons, never a color prop.
        // Green (mid-intensity) marks an active member, matching
        // SUI's sync-toggle "on" state; red/warning would misread.
        color: props.isMember ? T.midIntensity : T.text,
        padding: SP.sm,
        textAlign: "left",
      }}
    >
      {/* Both states mounted, `display` picks. This row re-renders from the
          store — the dispatch below lands as a subscription update, not as the
          click's own render — and swapping one component type for another at a
          fixed position leaves both svgs in the DOM when the render is
          detached. */}
      <ToggleRight
        size={ICON_SIZE}
        style={{ display: props.isMember ? "inline-flex" : "none" }}
      />
      <ToggleLeft
        size={ICON_SIZE}
        style={{ display: props.isMember ? "none" : "inline-flex" }}
      />
      <span style={{ flex: 1 }}>{props.name || "(unnamed)"}</span>
    </button>
  );
}

export function ThreadEditPane(props: { threadId: string }) {
  const { threadId } = props;
  const thread = useSlice((s) =>
    s.world.threads.find((t) => t.id === threadId),
  );
  const entitiesById = useSlice((s) => s.world.entitiesById);

  const title = useDraftField(thread?.title ?? "");
  const state = useDraftField(thread?.state ?? "");
  const latent = useDraftField(thread?.latent ?? "");

  const reqId = `se-thread-summary-${threadId}`;
  const bufferKey = `thread-summary:${threadId}`;
  const pending = useSlice((s) => isRequestActive(s.runtime, reqId));
  const live = useStream(bufferKey);
  const genRef = useRef(false);

  // Wipe a stale buffer on open; clean up on unmount.
  useEffect(() => {
    clearStream(bufferKey);
    return () => clearStream(bufferKey);
  }, [bufferKey]);

  // Stage the final streamed summary into the editable draft when a
  // pane-triggered generation finishes. genRef guards mount/stale/foreign
  // completions; [pending, live] deps make it order-independent (on failure the
  // handler cleared the buffer, so nothing stages).
  useEffect(() => {
    if (!genRef.current || pending) return;
    if (live !== undefined) state.setValue(live);
    clearStream(bufferKey);
    genRef.current = false;
  }, [pending, live]);

  if (!thread) return null;

  const onGenerate = () => {
    if (pending || genRef.current) return;
    genRef.current = true;
    clearStream(bufferKey);
    store.dispatch(
      uiThreadSummaryGenerationRequested({ threadId, requestId: reqId }),
    );
  };

  const close = () => store.dispatch(uiEditableDeactivate());

  const onSave = () => {
    store.dispatch(threadRenamed({ threadId, title: title.value.trim() }));
    store.dispatch(
      threadLedgerUpdated({
        threadId,
        state: state.value.trim(),
        latent: latent.value.trim(),
      }),
    );
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
          {title.value || "New Thread"}
        </span>
        <button onClick={onSave} style={{ padding: "4px 16px" }}>
          Save
        </button>
      </div>

      {/* Title */}
      <input
        placeholder="Thread title..."
        value={title.value}
        onInput={(e) => title.setValue(e.target.value ?? "")}
        style={inputStyle}
      />

      {/* Status. A labelled section like the rest of the pane; inside it the
          icon and the word change, and the button itself does not. */}
      <span style={sectionLabel}>Status</span>
      <button
        title={statusOption(thread.status).action}
        onClick={() =>
          store.dispatch(
            threadStatusSet({
              threadId,
              status: nextStatus(thread.status),
            }),
          )
        }
        style={{
          display: "flex",
          alignItems: "center",
          gap: SP.sm,
          alignSelf: "flex-start",
          background: "none",
          border: "none",
          cursor: "pointer",
          color: T.text,
          fontFamily: T.fontDefault,
          padding: 0,
        }}
      >
        <ThreadStatusIcon status={thread.status} size={ICON_SIZE} />
        {statusOption(thread.status).label}
      </button>

      {/* State — what the story model reads. */}
      <div style={{ display: "flex", alignItems: "center", gap: SP.sm }}>
        <span style={{ ...sectionLabel, flex: 1 }}>State</span>
        <button
          title="Generate state"
          onClick={onGenerate}
          disabled={pending}
          style={genZapStyle(pending)}
        >
          <Zap size={ICON_SIZE} />
        </button>
      </div>
      <span style={{ fontSize: "0.75em", color: T.textDisabled }}>
        What the story model sees when this cast is on the page. Say only what
        is already so.
      </span>
      <textarea
        placeholder="How do things stand between them right now?"
        value={live ?? state.value}
        disabled={pending}
        onInput={(e) => state.setValue(e.target.value ?? "")}
        style={{ ...inputStyle, minHeight: "80px", resize: "vertical" }}
      />

      {/* Private notes — never leave Story Engine. */}
      <span style={sectionLabel}>Private notes</span>
      <span style={{ fontSize: "0.75em", color: T.textDisabled }}>
        Never shown to the story model. What is unspoken, owed or concealed goes
        here.
      </span>
      <textarea
        placeholder="What is unsaid or unsettled between them?"
        value={latent.value}
        onInput={(e) => latent.setValue(e.target.value ?? "")}
        style={{ ...inputStyle, minHeight: "60px", resize: "vertical" }}
      />

      {/* Members */}
      <span style={sectionLabel}>Members</span>
      {CATEGORIES.map((cat) => {
        const members = Object.values(entitiesById).filter(
          (e) => e.categoryId === cat.id,
        );
        if (members.length === 0) return null;
        return (
          <div
            key={cat.id}
            style={{ display: "flex", flexDirection: "column", gap: SP.xs }}
          >
            <span style={{ fontSize: "0.75em", color: T.textDisabled }}>
              {cat.label}
            </span>
            {members.map((e) => (
              <MemberToggle
                key={e.id}
                threadId={threadId}
                entityId={e.id}
                name={e.name}
                isMember={thread.entityIds.includes(e.id)}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
