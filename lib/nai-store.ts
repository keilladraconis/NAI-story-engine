/*
 NAIStore - [0.1.0]
*/

// ==================================================
// Store Types
// ==================================================

export type Action = {
  type: string;
  [key: string]: any;
};

export type Reducer<S> = (state: S, action: Action) => S;

export type Selector<S, T> = (state: S) => T;

export type SelectorListener<T> = (value: T, action: Action) => void;

export type EffectContext<S> = {
  dispatch(action: Action): void;
  getState(): S;
};

export type Effect<S> = (action: Action, ctx: EffectContext<S>) => void;

// ==================================================
// Store Interface
// ==================================================

export interface Store<S> {
  getState(): S;
  dispatch(action: Action): void;
  subscribeSelector<T>(
    selector: Selector<S, T>,
    listener: SelectorListener<T>,
  ): () => void;
}

// ==================================================
// createStore
// ==================================================

export function createStore<S>(options: {
  initialState: S;
  reducer: Reducer<S>;
  effects?: Effect<S>[];
}): Store<S> {
  let state = options.initialState;

  const stateListeners = new Set<(state: S, action: Action) => void>();
  const effects = options.effects ?? [];

  function getState() {
    return state;
  }

  function dispatch(action: Action) {
    const prev = state;
    const next = options.reducer(prev, action);

    if (next !== prev) {
      state = next;
    }

    // Notify state listeners (even if unchanged)
    for (const l of stateListeners) {
      l(state, action);
    }

    // Run effects after reducers
    if (effects.length) {
      const ctx: EffectContext<S> = { dispatch, getState };
      for (const eff of effects) {
        eff(action, ctx);
      }
    }
  }

  function subscribe(listener: (state: S, action: Action) => void) {
    stateListeners.add(listener);
    return () => stateListeners.delete(listener);
  }

  function subscribeSelector<T>(
    selector: Selector<S, T>,
    listener: SelectorListener<T>,
  ) {
    let last = selector(state);

    return subscribe((state, action) => {
      const next = selector(state);
      if (Object.is(next, last)) return;
      last = next;
      listener(next, action);
    });
  }

  return {
    getState,
    dispatch,
    subscribeSelector,
  };
}

// ===============
// combineReducers
// ===============
export function combineReducers<S extends Record<string, any>>(reducers: {
  [K in keyof S]: Reducer<S[K]>;
}): Reducer<S> {
  return function combinedReducer(state: S, action: Action): S {
    let changed = false;
    const nextState = {} as S;

    for (const key in reducers) {
      const prevSlice = state[key];
      const nextSlice = reducers[key](prevSlice, action);
      nextState[key] = nextSlice;
      if (nextSlice !== prevSlice) changed = true;
    }

    return changed ? nextState : state;
  };
}

/*
 * END NAIStore
 */
