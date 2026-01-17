export type Action<Type extends string = string, Payload = any> = {
  type: Type;
  payload: Payload;
};

export type Reducer<S, A extends Action> = (state: S, action: A) => S;
type SliceReducer<S> = (state: S, action: Action) => S;
type ActionListener = (action: Action) => void;
type StateListener<S> = (state: S, action: Action) => void;

type EffectContext<S> = {
  dispatch: Dispatch;
  getState: GetState<S>;
};

export type Effect<S> = (action: Action, ctx: EffectContext<S>) => void;

export type Dispatch = (action: Action) => void;
type GetState<S> = () => S;

interface Store<S> {
  getState: GetState<S>;
  dispatch: Dispatch;
  subscribe: (listener: StateListener<S>) => () => void;
  subscribeToActions: (listener: ActionListener) => () => void;
}

export function createStore<S>(
  reducer: Reducer<S, Action>,
  initial: S,
): Store<S> {
  let state = initial;

  const actionListeners = new Set<ActionListener>();
  const stateListeners = new Set<StateListener<S>>();

  return {
    getState: () => state,
    dispatch(action: Action) {
      // 1. Always notify action listeners
      for (const l of actionListeners) {
        l(action);
      }

      // 2. Reduce
      const next = reducer(state, action);
      if (next === state) return;

      state = next;

      // 3. Notify state listeners only on change
      for (const l of stateListeners) {
        l(state, action);
      }
    },
    subscribe(listener: StateListener<S>) {
      stateListeners.add(listener);
      return () => stateListeners.delete(listener);
    },

    subscribeToActions(listener: ActionListener) {
      actionListeners.add(listener);
      return () => actionListeners.delete(listener);
    },
  };
}

export function createEffectRunner<S>(store: {
  dispatch: Dispatch;
  getState: GetState<S>;
}) {
  const effects: Effect<S>[] = [];

  return {
    register(effect: Effect<S>) {
      effects.push(effect);
    },

    run(action: Action) {
      for (const e of effects) {
        e(action, store);
      }
    },
  };
}

// Helpers

export function action<T extends string>(type: T) {
  return <P = void>() =>
    (payload: P) =>
      ({ type, payload }) as Action<T, P>;
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
