/*
 NAIStore - [0.1.0]
*/

// ==================================================
// Store Types
// ==================================================

type Action = {
  type: string;
  [key: string]: any;
};

type Reducer<S> = (state: S, action: Action) => S;

type Selector<S, T> = (state: S) => T;

type SelectorListener<T> = (value: T) => void;

type EffectPredicate = (action: Action) => boolean;

type EffectContext<S> = {
  dispatch(action: Action): void;
  getState(): S;
};

type Effect<S> = (action: Action, ctx: EffectContext<S>) => void;

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
  subscribeEffect(when: EffectPredicate, run: Effect<S>): () => boolean;
}

// ==================================================
// createStore
// ==================================================

export function createStore<S>(options: {
  initialState: S;
  reducer: Reducer<S>;
}): Store<S> {
  let state = options.initialState;

  const listeners = new Set<(state: S) => void>();
  const effects = new Set<{ when: EffectPredicate; run: Effect<S> }>();

  function getState() {
    return state;
  }

  function dispatch(action: Action) {
    state = options.reducer(state, action);

    for (const l of listeners) {
      l(state);
    }

    const ctx: EffectContext<S> = { dispatch, getState };
    for (const e of effects) {
      if (e.when(action)) e.run(action, ctx);
    }
  }

  function subscribe(listener: (state: S) => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function subscribeSelector<T>(
    selector: Selector<S, T>,
    listener: SelectorListener<T>,
  ) {
    let current = selector(state);
    // Selector listeners follow at-least-once semantics.
    listener(current);

    return subscribe((state) => {
      const next = selector(state);
      if (Object.is(next, current)) return;
      current = next;
      listener(next);
    });
  }

  function subscribeEffect(when: EffectPredicate, run: Effect<S>) {
    effects.add({ when, run });
    return () => effects.delete({ when, run });
  }

  return {
    getState,
    dispatch,
    subscribeSelector,
    subscribeEffect,
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
