// Two-click destructive confirm. First click arms (warning icon/color); a second
// click within timeoutMs fires onConfirm; otherwise it auto-resets. Uses
// api.v1.timers (no setTimeout in QuickJS). Mirrors SUI SuiConfirmButton.
//
// The resting icon and its size are props so this covers every destructive
// action, not just deletes — chat bubbles arm Retry with it too, since retrying
// prunes the turns after the message and there is no undo.
//
// Both icons stay mounted and toggle via `display`. A conditional component-type
// swap ({armed ? <AlertTriangle/> : <Trash2/>}) left BOTH svgs in the DOM when
// the timer-driven reset re-rendered — this runtime's reconciler doesn't unmount
// the old type on a detached-callback render. A style toggle on stable elements
// is the reliable path (same reason the highlight toggles elsewhere use style).

import { T } from "../style";
import { Trash2, AlertTriangle } from "nai:icons/feather";

const ICON_SIZE = 16;

export function ConfirmButton(props: {
  title: string;
  onConfirm: () => void;
  timeoutMs?: number;
  label?: string;
  /** Resting icon. Defaults to a trash can; armed always shows the warning. */
  icon?: IconComponent;
  /** Icon px. Defaults to 16; chat bubbles use 14 to match their action row. */
  size?: number;
  /**
   * Identity of the thing this button acts on. Changing it disarms.
   *
   * Needed because some lists (MessageList) key by index, so this component
   * instance can be reused for a different target while armed — without this,
   * the confirming tap would land on whatever moved into the slot.
   */
  resetKey?: string;
}) {
  const [armed, setArmed] = useState(false);
  const timerRef = useRef<number | null>(null);
  const Icon = props.icon ?? Trash2;
  const iconSize = props.size ?? ICON_SIZE;

  const clearTimer = () => {
    if (timerRef.current !== null) {
      void api.v1.timers.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  // Clear any pending reset timer when the button unmounts.
  useEffect(() => () => clearTimer(), []);

  // Disarm whenever the target changes out from under us.
  useEffect(() => {
    clearTimer();
    setArmed(false);
  }, [props.resetKey]);

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
      onClick={() => void onClick()}
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
      <Icon size={iconSize} style={{ display: armed ? "none" : "inline" }} />
      <AlertTriangle
        size={iconSize}
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
