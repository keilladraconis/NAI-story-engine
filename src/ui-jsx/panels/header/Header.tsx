// JSX header row for the Story Engine tab: GenX status (left, grows) + the
// Import button + Bootstrap button (right). Pinned to the top of the scrolling
// Story Engine pane via position:sticky (the App engine tab is the scroll
// container), with a solid background so content scrolls behind it.

import { SP, T } from "../../style";
import { GenxStatus } from "./GenxStatus";
import { BootstrapButton } from "./BootstrapButton";
import { Download } from "nai:icons/feather";

export function Header(props: { onOpenImport: () => void }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: SP.sm,
        position: "sticky",
        top: 0,
        zIndex: 1,
        background: T.bg,
        paddingBottom: SP.sm,
      }}
    >
      <div
        style={{ flex: 1, minWidth: 0, overflow: "hidden", display: "flex" }}
      >
        <GenxStatus />
      </div>
      <button
        title="Import existing content"
        onClick={props.onOpenImport}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          color: T.text,
          display: "flex",
          alignItems: "center",
          padding: "2px",
        }}
      >
        <Download size={16} />
      </button>
      <BootstrapButton />
    </div>
  );
}
