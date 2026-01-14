export type Listener<T> = (state: T, diff: StateDiff<T>) => void;

export interface StateDiff<T> {
  changed: (keyof T)[];
  previous: Partial<T>;
}

export type Action<T extends object> = (store: Store<T>) => void;

export class Store<T extends object> {
  private state: T;
  private listeners = new Set<Listener<T>>();

  constructor(initial: T) {
    this.state = { ...initial };
  }

  get(): Readonly<T> {
    return this.state;
  }

  update(mutator: (draft: T) => void) {
    const prev = { ...this.state };
    mutator(this.state);

    const changed = Object.keys(this.state).filter(
      (k) => this.state[k as keyof T] !== prev[k as keyof T],
    ) as (keyof T)[];

    if (changed.length > 0) {
      for (const listener of this.listeners) {
        listener(this.state, {
          changed,
          previous: prev,
        });
      }
    }
  }

  subscribe(listener: Listener<T>) {
    this.listeners.add(listener);
    // Notify with current state immediately
    listener(this.state, { changed: [], previous: {} });

    return () => this.listeners.delete(listener);
  }

  /**
   * Run a side effect when specific parts of the state change.
   */
  react(
    predicate: (diff: StateDiff<T>) => boolean,
    effect: (state: T) => void,
  ) {
    return this.subscribe((state, diff) => {
      if (predicate(diff)) {
        effect(state);
      }
    });
  }

  /**
   * Select a slice of the state and subscribe to changes on that slice.
   */
  select<S>(selector: (state: T) => S, onChange: (slice: S) => void) {
    let prev = selector(this.get());
    // Initial call
    onChange(prev);

    return this.subscribe((state) => {
      const next = selector(state);
      if (!this.isEqual(prev, next)) {
        prev = next;
        onChange(next);
      }
    });
  }

  private isEqual(a: any, b: any): boolean {
    if (a === b) return true;
    // Basic shallow check for objects/arrays could be added here if needed,
    // but Object.is (used implicitly by ===) is often enough for primitives.
    // For deep objects, we rely on the selector returning a new reference if it changed.
    return false;
  }
}

export class Dispatcher<T extends object> {
  private isDispatching = false;

  constructor(private store: Store<T>) {}

  dispatch(action: Action<T>) {
    if (this.isDispatching) {
      throw new Error("Dispatch cannot be called recursively");
    }

    try {
      this.isDispatching = true;
      action(this.store);
    } finally {
      this.isDispatching = false;
    }
  }
}
