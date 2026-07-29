// Two-click destructive confirm. First click arms (warning icon/color); a second
// click within timeoutMs fires onConfirm; otherwise it auto-resets. Uses
// api.v1.timers (no setTimeout in QuickJS). Mirrors SUI SuiConfirmButton.
//
// Both icons stay mounted and toggle via `display`. A conditional component-type
// swap ({armed ? <AlertTriangle/> : <Trash2/>}) left BOTH svgs in the DOM when
// the timer-driven reset re-rendered — this runtime's reconciler doesn't unmount
// the old type on a detached-callback render. A style toggle on stable elements
// is the reliable path (same reason the highlight toggles elsewhere use style).

import { T } from "../style";
import { useTapGuard } from "../tap-guard";
import { Trash2, AlertTriangle } from "nai:icons/feather";

const ICON_SIZE = 16;

export function ConfirmButton(props: {
  title: string;
  onConfirm: () => void;
  timeoutMs?: number;
  label?: string;
}) {
  const [armed, setArmed] = useState(false);
  const timerRef = useRef<number | null>(null);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      void api.v1.timers.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  // Clear any pending reset timer when the button unmounts.
  useEffect(() => () => clearTimer(), []);

  // A mobile tap can deliver `click` twice. Unguarded, click #1 arms and
  // click #2 confirms — one tap deletes, with no confirmation the user saw.
  const onceTap = useTapGuard();

  const onClick = async () => {
    if (armed) {
      clearTimer();
      setArmed(false);
      props.onConfirm();
      return;
    }
    setArmed(true);
    const id = await api.v1.timers.setTimeout(() => {
      timerRef.current = null;
      setArmed(false);
    }, props.timeoutMs ?? 4000);
    timerRef.current = id;
  };

  return (
    <button
      title={armed ? `${props.title}? Click again to confirm` : props.title}
      onClick={() => onceTap(() => void onClick())}
      style={{
        background: "none",
        border: "none",
        cursor: "pointer",
        color: armed ? T.warning : T.text,
        opacity: armed ? 1 : 0.6,
        display: "inline-flex",
        alignItems: "center",
      }}
    >
      <Trash2 size={ICON_SIZE} style={{ display: armed ? "none" : "inline" }} />
      <AlertTriangle
        size={ICON_SIZE}
        style={{ display: armed ? "inline" : "none" }}
      />
      {props.label ? (
        <span style={{ marginLeft: "4px", fontSize: "0.85em" }}>
          {armed ? "Confirm?" : props.label}
        </span>
      ) : null}
    </button>
  );
}
