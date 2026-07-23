// Generation Journal panel (JSX) — replaces SUI SeJournalPanel. Shows the
// recorded-entry count and copy buttons (Full journal + SEGA/Bootstrap/Forge
// digests) that write to the clipboard, plus Clear. Reads the effect-free
// generation-journal module directly; the count re-reads on request boundaries
// (the activeRequest watch, matching SUI) and after Clear.

import { useSlice } from "../../bridge";
import { T, SP } from "../../style";
import {
  getJournalCount,
  formatJournal,
  formatDigest,
  formatBootstrapDigest,
  formatForgeDigest,
  clearJournal,
} from "../../../core/generation-journal";

const btn = {
  fontSize: "0.75em",
  padding: "3px 8px",
  background: T.bg2,
  color: T.text,
  border: "none",
  cursor: "pointer",
  flexShrink: 0,
} as const;

export function JournalPanel() {
  // Re-render on request boundaries (proxy for "journal advanced"), like the SUI
  // watch on runtime.activeRequest. Primitive selector — no render loop.
  useSlice((s) => s.runtime.activeRequest?.id ?? "");
  const [, force] = useState(0); // bump after Clear so the count re-reads to 0

  const count = getJournalCount();
  const copy = (fmt: () => string, label: string) => {
    void (async () => {
      await api.v1.clipboard.writeText(fmt());
      void api.v1.ui.toast(`${label} copied to clipboard`, { type: "success" });
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
        {count} entries recorded
      </span>
      <button style={btn} onClick={() => copy(formatJournal, "Journal")}>
        Full
      </button>
      <button style={btn} onClick={() => copy(formatDigest, "SEGA digest")}>
        SEGA
      </button>
      <button
        style={btn}
        onClick={() => copy(formatBootstrapDigest, "Bootstrap digest")}
      >
        Bootstrap
      </button>
      <button style={btn} onClick={() => copy(formatForgeDigest, "Forge digest")}>
        Forge
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
