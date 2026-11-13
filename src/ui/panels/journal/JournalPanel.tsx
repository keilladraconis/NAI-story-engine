// Generation Journal panel: entry count, copy to clipboard, clear. Shown only
// when the `generation_journal` config is on.

import { useSlice } from "../../bridge";
import { T, SP } from "../../style";
import {
  journalCount,
  formatJournal,
  clearJournal,
} from "../../../core/engine/journal";

const btn = {
  minHeight: "32px",
  padding: "0 10px",
  background: T.bg2,
  color: T.text,
  border: "none",
  cursor: "pointer",
} as const;

export function JournalPanel() {
  // Re-render when the job list changes: a finished job is a new entry.
  useSlice((s) => s.runtime.jobs.length);
  const [, force] = useState(0);

  const copy = () => {
    void (async () => {
      await api.v1.clipboard.writeText(formatJournal());
      void api.v1.ui.toast("Journal copied to clipboard", { type: "success" });
    })();
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: SP.sm,
        padding: SP.md,
        color: T.text,
        fontFamily: T.fontDefault,
      }}
    >
      <span style={{ flex: 1, minWidth: 0, fontSize: "0.85em", opacity: 0.8 }}>
        {journalCount()} entries recorded
      </span>
      <button style={btn} onClick={copy}>
        Copy
      </button>
      <button
        style={{ ...btn, color: T.warning }}
        onClick={() => {
          clearJournal();
          force((n) => n + 1);
        }}
      >
        Clear
      </button>
    </div>
  );
}
