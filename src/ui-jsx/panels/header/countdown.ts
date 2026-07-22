// Budget-wait countdown for the JSX header. `remainingSeconds` is a pure helper
// (unit-tested); `useCountdown` re-renders every second while an endTime is
// active, using api.v1.timers (no setInterval in QuickJS) with ConfirmButton's
// timer/ref/cancel discipline. Date.now() is available in the UI runtime.

/** Whole seconds remaining until `endTime` (epoch ms), floored at 0. */
export function remainingSeconds(endTime: number | null, now: number): number {
  if (endTime == null) return 0;
  return Math.max(0, Math.ceil((endTime - now) / 1000));
}

/** Seconds left until `endTime`, re-rendering each second while > 0. Returns 0
 *  when `endTime` is null or elapsed. */
export function useCountdown(endTime: number | null): number {
  const [, forceTick] = useState(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (endTime == null) return;
    let cancelled = false;
    const clear = () => {
      if (timerRef.current !== null) {
        void api.v1.timers.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
    const loop = () => {
      void api.v1.timers
        .setTimeout(() => {
          if (cancelled) return;
          forceTick((n) => n + 1);
          if (remainingSeconds(endTime, Date.now()) > 0) loop();
        }, 1000)
        .then((id: number) => {
          if (cancelled) void api.v1.timers.clearTimeout(id);
          else timerRef.current = id;
        });
    };
    loop();
    return () => {
      cancelled = true;
      clear();
    };
  }, [endTime]);

  return remainingSeconds(endTime, Date.now());
}
