/*
 NAIStore - [0.1.1]
*/

// ==================================================
// Store Types
// ==================================================

export type Action<T = string> = {
  type: T;
  [key: string]: any;
};

type Reducer<S> = (state: S | undefined, action: Action) => S;

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
  subscribeEffect(when: EffectPredicate, run: Effect<S>): () => void;
}

// ==================================================
// createStore
// ==================================================

export function createStore<S>(
  reducer: Reducer<S>,
  debug: boolean = false,
): Store<S> {
  // Initialize state by dispatching the init action.
  let currentState = reducer(undefined, { type: "@@NAISTORE/INIT" });

  const listeners = new Set<(state: S) => void>();
  const effects = new Set<{ when: EffectPredicate; run: Effect<S> }>();

  function getState() {
    return currentState;
  }

  function dispatch(action: Action) {
    if (debug) api.v1.log("NAIACT", action);
    currentState = reducer(currentState, action);

    for (const l of listeners) {
      l(currentState);
    }

    const ctx: EffectContext<S> = { dispatch, getState };
    for (const e of effects) {
      if (e.when(action)) e.run(action, ctx);
    }
  }

  function subscribe(listener: (state: S) => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  function subscribeSelector<T>(
    selector: Selector<S, T>,
    listener: SelectorListener<T>,
  ) {
    let current = selector(currentState);
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
    const effect = { when, run };
    effects.add(effect);
    return () => {
      effects.delete(effect);
    };
  }

  return {
    getState,
    dispatch,
    subscribeSelector,
    subscribeEffect,
  };
}

// ==================================================
// Reducer Helpers
// ==================================================

type PayloadAction<P = void> = {
  type: string;
  payload: P;
};

type CaseReducer<S, P = any> = (state: S, payload: P) => S;

type ActionCreator<P> = void extends P
  ? (payload?: P) => PayloadAction<P>
  : (payload: P) => PayloadAction<P>;

type Slice<S, CR extends Record<string, CaseReducer<S, any>>> = {
  reducer: Reducer<S>;
  actions: {
    [K in keyof CR]: CR[K] extends (state: any, payload: infer P) => any
      ? ActionCreator<P>
      : () => PayloadAction<void>;
  };
};

/**
 * Creates a slice of state with auto-generated actions and reducer.
 */
export function createSlice<
  S,
  CR extends Record<string, CaseReducer<S, any>>,
>(options: { name: string; initialState: S; reducers: CR }): Slice<S, CR> {
  const { name, initialState, reducers } = options;
  const actions = {} as Slice<S, CR>["actions"];
  const handlers: Record<string, CaseReducer<S, any>> = {};

  for (const key of Object.keys(reducers)) {
    const actionType = `${name}/${key}`;
    handlers[actionType] = reducers[key];
    // @ts-ignore: Dynamic action creator assignment
    actions[key] = (payload: any) => ({ type: actionType, payload });
  }

  const reducer = (state: S | undefined, action: Action) => {
    if (state === undefined) return initialState;
    const handler = handlers[action.type];
    if (handler) {
      return handler(state, action.payload);
    }
    return state;
  };

  return { reducer, actions };
}

/**
 * Creates a reducer from a map of action handlers.
 */
export function createReducer<S, A extends Action = Action>(
  initialState: S,
  handlers: {
    [K in A["type"]]?: (state: S, action: Extract<A, { type: K }>) => S;
  },
): Reducer<S> {
  return (state = initialState, action: Action) => {
    // Cast action type to keyof handlers to safely index
    const handler = handlers[action.type as keyof typeof handlers];
    if (handler) {
      return handler(state, action as any);
    }
    return state;
  };
}

/**
 * Combines multiple slice reducers into a single root reducer.
 */
export function combineReducers<R extends Record<string, Reducer<any>>>(
  reducers: R,
): Reducer<{ [K in keyof R]: ReturnType<R[K]> }> {
  return function combinedReducer(state: any, action: Action) {
    let changed = false;
    const nextState: any = {};

    for (const key in reducers) {
      const prevSlice = state ? state[key] : undefined;
      const nextSlice = reducers[key](prevSlice, action);
      nextState[key] = nextSlice;
      if (!state || nextSlice !== prevSlice) changed = true;
    }

    return changed ? nextState : state;
  };
}

// ==================================================
// Effect Helpers
// ==================================================

/**
 * Type-safe action matcher for use with subscribeEffect.
 * Extracts the action type string from an action creator.
 *
 * @example
 * subscribeEffect(
 *   matchesAction(myAction),
 *   (action, ctx) => {
 *     // action.payload is properly typed
 *   }
 * );
 */
export function matchesAction<P>(
  actionCreator: (payload: P) => PayloadAction<P>,
): (action: Action) => action is PayloadAction<P> {
  // Get the action type by calling the creator with a placeholder
  const actionType = actionCreator(undefined as P).type;
  return (action): action is PayloadAction<P> => action.type === actionType;
}

/*
 * END NAIStore
 */
