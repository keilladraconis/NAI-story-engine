import { Store } from "./nai-store";

// ---------------------------------------------
// Types
// ---------------------------------------------

// ---------------------------------------------
// Internal registries
// ---------------------------------------------

const mountedComponents = new Map<string, MountedComponent>();

// ---------------------------------------------
// Mounted component record
// ---------------------------------------------

interface MountedComponent {
  id: string;
  unsubs: (() => void)[];
}

// ---------------------------------------------
// createEvents
// ---------------------------------------------

/**
 * Creates stable, non-closure-based event handlers.
 * Handlers receive props explicitly at call time.
 */
export function createEvents<
  T extends Record<string, (props: any, ...args: any[]) => void>,
>(handlers: T): T {
  const stable: any = {};

  for (const key in handlers) {
    const fn = handlers[key];
    stable[key] = (props: any, ...args: any[]) => {
      fn(props, ...args);
    };
  }

  return stable as T;
}

// ---------------------------------------------
// useSelector
// ---------------------------------------------

export function createUseSelector<State>(store: Store<State>) {
  return function useSelector<T>(
    selector: (state: State) => T,
    effect: (value: T, prev: T | undefined) => void,
    equalityFn: (a: T, b: T) => boolean = (a, b) => a === b,
  ): () => void {
    let last = selector(store.getState());
    effect(last, undefined);

    const unsubscribe = store.subscribe((state) => {
      const next = selector(state);
      if (!equalityFn(next, last)) {
        const prev = last;
        last = next;
        effect(next, prev);
      }
    });

    return unsubscribe;
  };
}

// ---------------------------------------------
// mount
// ---------------------------------------------

export interface BindContext<State> {
  useSelector: <T>(
    selector: (state: State) => T,
    effect: (value: T, prev: T | undefined) => void,
    equalityFn?: (a: T, b: T) => boolean,
  ) => void;
  updateParts: (parts: (Partial<UIPart> & { id: string })[]) => void;
  mount: <P>(comp: Component<P, State>, props: P) => UIPart;
  unmount: <P>(comp: Component<P, State>, props: P) => void;
}

export interface Component<Props, State = any> {
  id(props: Props): string;
  describe(props: Props): UIPart;
  bind(ctx: BindContext<State>, props: Props): void;
}

export function mount<Props, State>(
  component: Component<Props, State>,
  props: Props,
  store: Store<State>,
) {
  const id = component.id(props);
  if (mountedComponents.has(id)) {
    // Already mounted. In strict mode we might throw.
    throw new Error(`Component '${id}' is already mounted`);
  }

  // 1. Describe
  const part = component.describe(props);
  if (!part?.id) {
    throw new Error(`describe() must return a UIPart with an id`);
  }

  // 2. Bind
  const unsubs: (() => void)[] = [];

  const ctx: BindContext<State> = {
    useSelector(selector, effect, equalityFn) {
      const unsub = createUseSelector(store)(selector, effect, equalityFn);
      unsubs.push(unsub);
    },
    updateParts: api.v1.ui.updateParts,
    mount: (comp, p) => mount(comp, p, store),
    unmount: (comp, p) => unmount(comp, p),
  };

  component.bind(ctx, props);

  mountedComponents.set(id, { id, unsubs });

  return part;
}

// ---------------------------------------------
// unmount
// ---------------------------------------------

export function unmount<Props, State>(
  component: Component<Props, State>,
  props: Props,
) {
  const id = component.id(props);
  const record = mountedComponents.get(id);
  if (!record) return;

  for (const unsub of record.unsubs) unsub();
  mountedComponents.delete(id);
}
