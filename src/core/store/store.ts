import { Action, Listener, Reducer } from "./types";

export interface Store<S> {
  getState: () => S;
  dispatch: (action: Action) => void;
  subscribe: (listener: Listener<S>) => () => void;
}

export function createStore<S>(
  reducer: Reducer<S, Action>,
  initialState: S,
  middleware?: Array<(store: Store<S>) => (next: (action: Action) => void) => (action: Action) => void>
): Store<S> {
  let state = initialState;
  const listeners = new Set<Listener<S>>();

  const baseDispatch = (action: Action) => {
    state = reducer(state, action);
    for (const listener of listeners) {
      try {
        listener(state, action);
      } catch (e) {
        api.v1.log("Error in store listener", e);
      }
    }
  };

  let dispatch = baseDispatch;

  const store: Store<S> = {
    getState: () => state,
    dispatch: (action) => dispatch(action),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };

  if (middleware && middleware.length > 0) {
    const chain = middleware.map((mw) => mw(store));
    dispatch = chain.reduceRight(
      (next, mw) => mw(next),
      baseDispatch
    );
  }

  return store;
}
