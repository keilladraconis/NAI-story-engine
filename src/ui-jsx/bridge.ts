// Bridges nai-store into the Preact tree. nai-store stays the single source of
// truth; useSlice subscribes a component to a selected slice of it.
//
// sliceStore is the non-hook core (testable headless). useSlice wraps it with
// the NAI-runtime-provided useSyncExternalStore global.
//
// Select PRIMITIVES (string/number/boolean). useSyncExternalStore compares
// snapshots by Object.is; a selector returning a fresh object each call would
// loop. For derived objects, pass an `equals` and memoize at the call site.

import { store, type RootState } from "../core/store";

export function sliceStore<T>(
  selector: (s: RootState) => T,
  equals?: (a: T, b: T) => boolean,
): { subscribe: (onChange: () => void) => () => void; getSnapshot: () => T } {
  return {
    subscribe: (onChange) =>
      store.subscribeSelector(selector, () => onChange(), equals),
    getSnapshot: () => selector(store.getState()),
  };
}

export function useSlice<T>(
  selector: (s: RootState) => T,
  equals?: (a: T, b: T) => boolean,
): T {
  // `useSyncExternalStore` requires REFERENTIALLY STABLE subscribe/getSnapshot.
  // Passing fresh closures each render (as a bare `sliceStore(selector)` call
  // does) breaks live re-rendering for a component that only updates from a
  // store change with no co-occurring local re-render — e.g. a streaming chat
  // bubble subscribes but never re-renders. Keep the latest selector/equals in
  // refs so subscribe/getSnapshot identities stay fixed for the component's life.
  const selectorRef = useRef(selector);
  selectorRef.current = selector;
  const equalsRef = useRef(equals);
  equalsRef.current = equals;

  const subscribe = useCallback(
    (onChange: () => void) =>
      store.subscribeSelector(
        (s) => selectorRef.current(s),
        () => onChange(),
        equalsRef.current,
      ),
    [],
  );
  const getSnapshot = useCallback(
    () => selectorRef.current(store.getState()),
    [],
  );

  return useSyncExternalStore(subscribe, getSnapshot);
}
