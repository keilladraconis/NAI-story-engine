// Bootstrap button for the JSX header — the Opening Scene / Continue Scene
// control, a JSX port of SeHeaderBar's bootstrap state machine. The idle label
// is derived live from the document (empty → Opening, non-empty → Continue) and
// re-derived on undo/redo (historyEpoch) and after a bootstrap settles. Queued →
// cancel; active → dimmed. Waiting states (Continue/budget) live in GenxStatus,
// not here (see the header design).

import { useSlice } from "../../bridge";
import {
  store,
  bootstrapRequested,
  bootstrapContinueRequested,
  uiCancelRequest,
} from "../../../core/store";

const stageLabel = (type?: string): string =>
  type === "bootstrapContinue" ? "⚡ Continue Scene" : "⚡ Opening Scene";

const BTN = {
  padding: "4px 8px",
  fontSize: "0.8em",
  background: "none",
  border: "none",
  cursor: "pointer",
  color: "var(--theme-text-headings)",
  whiteSpace: "nowrap",
} as const;

export function BootstrapButton() {
  const historyEpoch = useSlice((s) => s.runtime.historyEpoch);
  const queuedId = useSlice(
    (s) =>
      s.runtime.queue.find(
        (r) => r.type === "bootstrap" || r.type === "bootstrapContinue",
      )?.id ?? "",
  );
  const pendingType = useSlice((s) => {
    const q = s.runtime.queue.find(
      (r) => r.type === "bootstrap" || r.type === "bootstrapContinue",
    );
    const a = s.runtime.activeRequest;
    return (
      q?.type ??
      (a?.type === "bootstrap" || a?.type === "bootstrapContinue" ? a.type : "")
    );
  });
  const active = useSlice((s) => {
    const t = s.runtime.activeRequest?.type;
    return t === "bootstrap" || t === "bootstrapContinue";
  });

  const [hasContent, setHasContent] = useState(false);

  // Re-derive the idle label from the document on mount, after undo/redo
  // (historyEpoch), and when a bootstrap request settles (active → false).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const has = (await api.v1.document.sectionIds()).length > 0;
      if (!cancelled) setHasContent(has);
    })();
    return () => {
      cancelled = true;
    };
  }, [historyEpoch, active]);

  // Queued: dimmed, click cancels the queued request.
  if (queuedId) {
    return (
      <button
        style={{ ...BTN, opacity: 0.4 }}
        onClick={() => store.dispatch(uiCancelRequest({ requestId: queuedId }))}
      >
        {stageLabel(pendingType)}
      </button>
    );
  }

  // Active/generating: dimmed, non-interactive (waiting states show in GenxStatus).
  if (active) {
    return (
      <button style={{ ...BTN, opacity: 0.4, cursor: "default" }} disabled>
        {stageLabel(pendingType)}
      </button>
    );
  }

  // Idle: derived from document content.
  return (
    <button
      style={{ ...BTN, opacity: 0.85 }}
      onClick={() =>
        store.dispatch(
          hasContent ? bootstrapContinueRequested() : bootstrapRequested(),
        )
      }
    >
      {hasContent ? "⚡ Continue Scene" : "⚡ Opening Scene"}
    </button>
  );
}
