import { Action, Listener, Reducer, SliceReducer } from "./types";

export interface Store<S> {
  getState: () => S;
  dispatch: (action: Action) => void;
  subscribe: (listener: Listener<S>) => () => void;
}

export function createStore<S>(
  reducer: Reducer<S, Action>,
  initial: S,
): Store<S> {
  let state = initial;
  const listeners = new Set<Listener<S>>();

  return {
    getState: () => state,
    dispatch(action: Action) {
      const next = reducer(state, action);
      if (next !== state) {
        state = next;
        for (const l of listeners) l(state, action);
      }
    },
    subscribe(listener: Listener<S>) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function combineReducers<S extends Record<string, any>>(reducers: {
  [K in keyof S]: SliceReducer<S[K]>;
}) {
  return (state: S, action: Action): S => {
    let changed = false;
    const next = {} as S;

    for (const key in reducers) {
      const prevSlice = state[key];
      const nextSlice = reducers[key](prevSlice, action);
      next[key] = nextSlice;
      if (nextSlice !== prevSlice) changed = true;
    }

    return changed ? next : state;
  };
}
