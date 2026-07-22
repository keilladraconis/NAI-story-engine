// JSX header row for the Story Engine tab: GenX status (left, grows) + the
// Bootstrap button (right). Import wizard is a later slice.

import { SP } from "../../style";
import { GenxStatus } from "./GenxStatus";
import { BootstrapButton } from "./BootstrapButton";

export function Header() {
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
      <BootstrapButton />
    </div>
  );
}
