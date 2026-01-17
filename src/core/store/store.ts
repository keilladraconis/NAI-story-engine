export type Action<Type extends string = string, Payload = any> = {
  type: Type;
  payload: Payload;
};

export type Reducer<S, A extends Action> = (state: S, action: A) => S;
type SliceReducer<S> = (state: S, action: Action) => S;
type Listener<S> = (state: S, action: Action) => void;

type EffectContext<S> = {
  dispatch: Dispatch;
  getState: GetState<S>;
};

type Effect<S> = (action: Action, ctx: EffectContext<S>) => void;

export type Dispatch = (action: Action) => void;
type GetState<S> = () => S;

interface Store<S> {
  getState: GetState<S>;
  dispatch: Dispatch;
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
