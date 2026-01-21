/*
 NAIAct - [0.1.0]
*/

// --------------------------------------------------
// Core Types
// --------------------------------------------------

interface StoreLike<S, A = any> {
  getState(): S;
  dispatch(action: A): void;
  subscribeSelector<T>(
    selector: (state: S) => T,
    listener: (value: T, action: A) => void,
  ): () => void;
}

export interface BindContext<S, A = any> {
  getState(): S;
  dispatch(action: A): void;
  useSelector<T>(
    selector: (state: S) => T,
    listener: (value: T, action: A) => void,
  ): () => void;
  useEffect<T>(
    selector: (state: S) => T,
    effect: (value: T, action: A | undefined) => void | (() => void),
  ): void;
  mount<P>(component: Component<P, S>, props: P): () => void;
}

// --------------------------------------------------
// Component Definition
// --------------------------------------------------

export interface Component<Props, State = any> {
  id(props: Props): string;
  events?: unknown;
  describe(props: Props): UIPart;
  bind(props: Props, ctx: BindContext<State>): void;
}

// --------------------------------------------------
// Helpers
// --------------------------------------------------

export function createEvents<
  T extends Record<string, (...args: any[]) => any>,
>() {
  const handlers: Partial<T> = {};
  const slots: Record<string, (...args: any[]) => any> = {};

  const proxy = new Proxy({} as T, {
    get(target, key: string, receiver) {
      // 🔧 FIX: respect real properties on the target
      if (key in target) {
        return Reflect.get(target, key, receiver);
      }

      if (!slots[key]) {
        slots[key] = (...args: any[]) => {
          const fn = handlers[key];
          if (fn) {
            return fn(...args);
          }
        };
      }
      return slots[key] as T[keyof T];
    },
  });

  function attach(next: T) {
    for (const key in next) {
      handlers[key] = next[key];
    }
  }

  return Object.assign(proxy, { attach });
}

// --------------------------------------------------
// Mount / Unmount
// --------------------------------------------------

export function mount<Props, State, Action>(
  component: Component<Props, State>,
  props: Props,
  store: StoreLike<State, Action>,
): () => void {
  const cleanups: (() => void)[] = [];

  const ctx: BindContext<State, Action> = {
    getState: store.getState.bind(store),
    dispatch: store.dispatch.bind(store),
    useSelector(selector, listener) {
      return store.subscribeSelector(selector, listener);
    },
    useEffect(selector, effect) {
      let cleanup: void | (() => void);

      const unsubscribe = store.subscribeSelector(selector, (value, action) => {
        if (cleanup) cleanup();
        cleanup = effect(value, action);
      });

      // run once immediately
      cleanup = effect(selector(store.getState()), undefined);

      cleanups.push(() => {
        if (cleanup) cleanup();
        unsubscribe();
      });
    },
    mount<P>(child: Component<P, State>, childProps: P): () => void {
      const unmount = mount(child, childProps, store);
      cleanups.push(unmount);
      return unmount;
    },
  };

  component.bind(props, ctx);

  return () => {
    for (const fn of cleanups.splice(0)) {
      fn();
    }
  };
}

/*
 * END NAIAct
 */
