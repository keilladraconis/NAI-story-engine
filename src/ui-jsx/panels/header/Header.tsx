// JSX header row for the Story Engine tab: GenX status (left, grows) + the
// Import button + Bootstrap button (right).

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
        paddingBottom: SP.sm,
      }}
    >
      <div style={{ flex: 1, minWidth: 0, overflow: "hidden", display: "flex" }}>
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
