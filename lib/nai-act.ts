/*
 NAIAct - [0.1.0]
*/

// --------------------------------------------------
// Core Types
// --------------------------------------------------

type ActionLike = { type: string };

export interface StoreLike<S> {
  getState(): S;
  dispatch(action: ActionLike): void;
  subscribeSelector<T>(
    selector: (state: S) => T,
    listener: (value: T) => void,
  ): () => void;
  subscribeEffect(
    when: (action: ActionLike) => boolean,
    run: (
      action: ActionLike,
      ctx: { dispatch: (action: ActionLike) => void; getState: () => S },
    ) => void,
  ): () => void;
}

export interface BindContext<S> {
  getState(): S;
  dispatch(action: ActionLike): void;
  useSelector<T>(
    selector: (state: S) => T,
    listener: (value: T) => void,
  ): () => void;
  useEffect(
    when: (action: ActionLike) => boolean,
    run: (
      action: ActionLike,
      ctx: { dispatch: (action: ActionLike) => void; getState: () => S },
    ) => void,
  ): () => void;
  mount<P>(component: Component<P, S>, props: P): () => void;
}

// --------------------------------------------------
// Component Definition
// --------------------------------------------------

type ComponentId<P> = [unknown] extends [P]
  ? (props?: P) => string
  : [P] extends [void]
  ? () => string
  : (props: P) => string;

// Define a broad Style type as the underlying API uses 'any'
export type Style = Record<string, any>;

type StyleResolver<St extends Record<string, Style>> = (
  ...keys: (keyof St | undefined | false | null)[]
) => Style;

export interface Component<
  P,
  S = unknown,
  E = unknown,
  St extends Record<string, Style> = Record<string, Style>,
> {
  id: ComponentId<P>;
  events: E;
  styles?: St;
  style?: StyleResolver<St>;
  describe(props: P): UIPart;
  onMount(props: P, ctx: BindContext<S>): void;
}

export function defineComponent<
  P,
  S,
  E,
  St extends Record<string, Style> = Record<string, Style>,
>(
  component: Component<P, S, E, St> & ThisType<Component<P, S, E, St>>,
): Component<P, S, E, St> {
  if (component.styles) {
    component.style = function (
      ...keys: (keyof St | undefined | false | null)[]
    ): Style {
      return mergeStyles(...keys.map((k) => (k ? this.styles?.[k] : undefined)));
    };
  }
  return component;
}

// --------------------------------------------------
// Styling Helpers
// --------------------------------------------------

/**
 * Merges multiple style objects into one.
 * Later styles override earlier ones.
 */
export function mergeStyles(...styles: (Style | undefined | null)[]): Style {
  const result: Style = {};
  for (const style of styles) {
    if (style) {
      Object.assign(result, style);
    }
  }
  return result;
}

// --------------------------------------------------
// Events
// --------------------------------------------------

type EventMap = Record<string, (...args: any[]) => any>;

type AugmentedEvents<P, Defs extends EventMap> = {
  [K in keyof Defs]: P extends void
    ? Defs[K]
    : (props: P, ...args: Parameters<Defs[K]>) => ReturnType<Defs[K]>;
};

export function createEvents<P, Defs extends EventMap>() {
  const handlers: Partial<AugmentedEvents<P, Defs>> = {};
  const slots: Record<string, Function> = {};

  return new Proxy({} as any, {
    get(_target, key: string) {
      if (key === "attach") {
        return (next: Partial<AugmentedEvents<P, Defs>>) =>
          Object.assign(handlers, next);
      }

      if (!slots[key]) {
        slots[key] = (...args: any[]) => {
          const fn = handlers[key as keyof typeof handlers];
          // @ts-ignore: Dynamic dispatch based on key
          return fn ? fn(...args) : undefined;
        };
      }
      return slots[key];
    },
  }) as AugmentedEvents<P, Defs> & {
    attach(handlers: Partial<AugmentedEvents<P, Defs>>): void;
  };
}

// --------------------------------------------------
// Mount
// --------------------------------------------------

export function mount<P, S>(
  component: Component<P, S>,
  props: P,
  store: StoreLike<S>,
): () => void {
  const cleanups: (() => void)[] = [];

  const addCleanup = (fn: () => void) => {
    cleanups.push(fn);
    return () => {
      fn();
      const index = cleanups.indexOf(fn);
      if (index !== -1) cleanups.splice(index, 1);
    };
  };

  const ctx: BindContext<S> = {
    getState: store.getState.bind(store),
    dispatch: store.dispatch.bind(store),

    useSelector(selector, listener) {
      const unsub = store.subscribeSelector(selector, listener);
      return addCleanup(unsub);
    },

    useEffect(when, run) {
      const unsub = store.subscribeEffect(when, run);
      return addCleanup(unsub);
    },

    mount(child, childProps) {
      const unsub = mount(child, childProps, store);
      return addCleanup(unsub);
    },
  };

  component.onMount.call(component, props, ctx);

  return () => {
    const toRun = cleanups.splice(0);
    for (const fn of toRun) {
      fn();
    }
  };
}

/*
 * END NAIAct
 */