// Two-click destructive confirm. First click arms (warning icon/color); a second
// click within timeoutMs fires onConfirm; otherwise it auto-resets. Uses
// api.v1.timers (no setTimeout in QuickJS). Mirrors SUI SuiConfirmButton.

import { T } from "../style";
import { Trash2, AlertTriangle } from "nai:icons/feather";

const ICON_SIZE = 16;

export function ConfirmButton(props: {
  title: string;
  onConfirm: () => void;
  timeoutMs?: number;
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
      onClick={onClick}
      style={{
        background: "none",
        border: "none",
        cursor: "pointer",
        color: armed ? T.warning : T.text,
        opacity: armed ? 1 : 0.6,
      }}
    >
      {armed ? <AlertTriangle size={ICON_SIZE} /> : <Trash2 size={ICON_SIZE} />}
    </button>
  );
}
