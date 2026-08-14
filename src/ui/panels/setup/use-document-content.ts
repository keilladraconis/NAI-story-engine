// Whether the story has any prose yet — it picks the bootstrap button's label.
//
// `initial` is read once in mount.ts before register(), so the first paint is
// already right; after that it is re-read whenever document history moves or a
// bootstrap settles, the two ways an empty story becomes non-empty.
//
// Moved out of Header.tsx along with the button that needs it.

import { useSlice } from "../../bridge";
import { selectBootstrapPending } from "./setup-model";

export function useHasDocumentContent(initial: boolean): boolean {
  const [has, setHas] = useState(initial);
  const historyEpoch = useSlice((s) => s.runtime.historyEpoch);
  const bootstrapPending = useSlice(selectBootstrapPending);
  const seqRef = useRef(0);

  useEffect(() => {
    const seq = ++seqRef.current;
    void api.v1.document.sectionIds().then((ids: number[]) => {
      // seq !== seqRef.current means a newer read started while this one was in
      // flight; an older read resolving later must not clobber it.
      if (seq === seqRef.current) setHas(ids.length > 0);
    });
  }, [historyEpoch, bootstrapPending]);

  return has;
}
