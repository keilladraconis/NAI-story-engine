// ThreadEditPane — edit pane for a WorldGroup (Thread), counterpart to
// EntityEditPane and SUI's SeThreadEditPane. Title + summary are local drafts
// committed on Save (groupRenamed + groupSummaryUpdated); the summary has a
// generate zap that streams into the draft via the shared stream-buffer.
// Membership toggles dispatch entityGroupToggled immediately (not part of the
// draft). No Delete (that lives on the ThreadItem card) and no lorebook toggle
// (a later slice) — matching SUI scope.

import { useSlice, useStream } from "../../bridge";
import { useDraftField } from "../../hooks";
import { T, SP } from "../../style";
import { useTapGuard } from "../../tap-guard";
import {
  store,
  groupRenamed,
  groupSummaryUpdated,
  entityGroupToggled,
  uiThreadSummaryGenerationRequested,
  uiEditableDeactivate,
} from "../../../core/store";
import { isRequestActive } from "./world-select";
import { clearStream } from "../../../core/store/stream-buffer";
import { CATEGORIES } from "./EntityEditPane";
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

// One membership row. Its own component so each row owns its own tap guard —
// a shared guard would let a tap on one member swallow a tap on the next.
function MemberToggle(props: {
  groupId: string;
  entityId: string;
  name: string;
  isMember: boolean;
}) {
  // Membership is a boolean flip: an unguarded repeat click from a single tap
  // toggles it straight back, so the row looks unresponsive.
  const onceTap = useTapGuard();
  return (
    <button
      onClick={() =>
        onceTap(() =>
          store.dispatch(
            entityGroupToggled({
              groupId: props.groupId,
              entityId: props.entityId,
            }),
          ),
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
      {props.isMember ? (
        <ToggleRight size={ICON_SIZE} />
      ) : (
        <ToggleLeft size={ICON_SIZE} />
      )}
      <span style={{ flex: 1 }}>{props.name || "(unnamed)"}</span>
    </button>
  );
}

export function ThreadEditPane(props: { groupId: string }) {
  const { groupId } = props;
  const group = useSlice((s) => s.world.groups.find((g) => g.id === groupId));
  const entitiesById = useSlice((s) => s.world.entitiesById);

  const title = useDraftField(group?.title ?? "");
  const summary = useDraftField(group?.summary ?? "");

  const reqId = `se-thread-summary-${groupId}`;
  const bufferKey = `thread-summary:${groupId}`;
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
    if (live !== undefined) summary.setValue(live);
    clearStream(bufferKey);
    genRef.current = false;
  }, [pending, live]);

  if (!group) return null;

  const onGenerate = () => {
    if (pending || genRef.current) return;
    genRef.current = true;
    clearStream(bufferKey);
    store.dispatch(
      uiThreadSummaryGenerationRequested({ groupId, requestId: reqId }),
    );
  };

  const close = () => store.dispatch(uiEditableDeactivate());

  const onSave = () => {
    store.dispatch(groupRenamed({ groupId, title: title.value.trim() }));
    store.dispatch(
      groupSummaryUpdated({ groupId, summary: summary.value.trim() }),
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

      {/* Summary */}
      <div style={{ display: "flex", alignItems: "center", gap: SP.sm }}>
        <span style={{ ...sectionLabel, flex: 1 }}>Summary</span>
        <button
          title="Generate summary"
          onClick={onGenerate}
          disabled={pending}
          style={genZapStyle(pending)}
        >
          <Zap size={ICON_SIZE} />
        </button>
      </div>
      <textarea
        placeholder="What is this thread's dynamic?"
        value={live ?? summary.value}
        disabled={pending}
        onInput={(e) => summary.setValue(e.target.value ?? "")}
        style={{ ...inputStyle, minHeight: "80px", resize: "vertical" }}
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
                groupId={groupId}
                entityId={e.id}
                name={e.name}
                isMember={group.entityIds.includes(e.id)}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
