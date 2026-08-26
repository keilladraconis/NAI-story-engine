// A collapsible-section header: a chevron and a label, as one button that
// toggles the section below it.
//
// Shared: Setup's Foundation section and the Engine's settings section on the
// Engine tab. Two hand-rolled copies of this row would be two places to keep the
// chevron rule (below) and one style block that drifts.

import { SP, T } from "../style";
import { ChevronDown, ChevronRight } from "nai:icons/feather";

const ICON_SIZE = 14;

/** Both chevrons stay mounted and toggle via `display`. Swapping one component
 *  type for another at a fixed position leaves the old svg behind when the
 *  re-render arrives from a store subscription rather than a JSX event handler,
 *  and Setup's renders are store-driven. Same workaround as ConfirmButton. */
function Chevron(props: { open: boolean }) {
  return (
    <Fragment>
      <ChevronDown
        size={ICON_SIZE}
        style={{ display: props.open ? "inline-flex" : "none" }}
      />
      <ChevronRight
        size={ICON_SIZE}
        style={{ display: props.open ? "none" : "inline-flex" }}
      />
    </Fragment>
  );
}

export function SectionHeader(props: {
  label: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={props.onToggle}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: SP.sm,
        alignSelf: "flex-start",
        background: "none",
        border: "none",
        cursor: "pointer",
        color: T.textHeadings,
        fontFamily: T.fontDefault,
        fontWeight: "bold",
        padding: 0,
      }}
    >
      <Chevron open={props.open} />
      {props.label}
    </button>
  );
}
