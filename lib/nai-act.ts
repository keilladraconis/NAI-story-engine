/*
 NAIAct - [0.2.0]
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
  render<P>(component: Component<P, S>, props: P): { part: UIPart; unmount: () => void };
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
  St extends Record<string, Style> = Record<string, Style>,
> {
  id: ComponentId<P>;
  styles?: St;
  style?: StyleResolver<St>;
  build(props: P, ctx: BindContext<S>): UIPart;
}

export function defineComponent<
  P,
  S = unknown,
  St extends Record<string, Style> = Record<string, Style>,
>(
  component: Component<P, S, St> & ThisType<Component<P, S, St>>,
): Component<P, S, St> {
  if (component.styles) {
    component.style = function (
      ...keys: (keyof St | undefined | false | null)[]
    ): Style {
      return mergeStyles(
        ...keys.map((k) => (k ? this.styles?.[k] : undefined)),
      );
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
// Mount
// --------------------------------------------------

export function mount<P, S>(
  component: Component<P, S>,
  props: P,
  store: StoreLike<S>,
): { part: UIPart; unmount: () => void } {
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

    render(child, childProps) {
      const result = mount(child, childProps, store);
      const unmount = addCleanup(result.unmount);
      return { part: result.part, unmount };
    },
  };

  const part = component.build.call(component, props, ctx);

  return {
    part,
    unmount() {
      const toRun = cleanups.splice(0);
      for (const fn of toRun) {
        fn();
      }
    },
  };
}

/*
 * END NAIAct
 */
