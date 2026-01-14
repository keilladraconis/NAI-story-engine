Got it — this is a **reactive state + imperative actions** problem, not just pub/sub. The mistake many systems make is trying to wire UI callbacks _directly_ to pub/sub events. That’s where things get lost.

The robust design here is to **separate mutation, state, and notification**, and make _state_ the source of truth that everything subscribes to.

Below is a design that scales cleanly from UI → backend systems → queues without callback loss.

---

## The key shift (this matters)

> **UI callbacks should never notify other systems directly.
> They should mutate state.
> Everything else reacts to state changes.**

Once you do this, ordering, timing, and subscriber lifetime stop being brittle.

---

## High-level architecture

```
[ UI elements ]
     |
     v
[ Actions / Commands ]   ← imperative, one-shot
     |
     v
[ State Store ]          ← durable, replayable
     |
     v
[ Reactive Subscribers ]
   - UI renderers
   - Queues
   - Side-effect systems
```

---

## 1️⃣ Central state store (authoritative)

Your store:

- owns the data
- is synchronous to mutate
- emits **change records**, not callbacks

```ts
type Listener<T> = (state: T, diff: StateDiff<T>) => void;

interface StateDiff<T> {
  changed: (keyof T)[];
  previous: Partial<T>;
}
```

```ts
class Store<T extends object> {
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
    listener(this.state, { changed: [], previous: {} });

    return () => this.listeners.delete(listener);
  }
}
```

This immediately solves:

- late subscribers
- UI reconnects
- backend restarts (with hydration)

---

## 2️⃣ Actions (what UI calls)

UI components **never publish events**.
They dispatch _intent_.

```ts
type Action<T> = (store: Store<T>) => void;
```

```ts
const setPrompt =
  (prompt: string): Action<AppState> =>
  (store) => {
    store.update((state) => {
      state.prompt = prompt;
    });
  };
```

UI usage:

```ts
button.onclick = () => {
  dispatch(setPrompt(textarea.value));
};
```

This:

- keeps UI simple
- prevents duplicated logic
- avoids UI → backend coupling

---

## 3️⃣ Selective subscriptions (no rerender storms)

Subscribers declare _interest_, not callbacks tied to fields.

```ts
function select<T, S>(
  store: Store<T>,
  selector: (state: T) => S,
  onChange: (slice: S) => void,
) {
  let prev = selector(store.get());

  return store.subscribe((state) => {
    const next = selector(state);
    if (!Object.is(prev, next)) {
      prev = next;
      onChange(next);
    }
  });
}
```

UI:

```ts
select(
  store,
  (s) => s.prompt,
  (prompt) => {
    textarea.value = prompt;
  },
);
```

Queue system:

```ts
select(
  store,
  (s) => s.prompt,
  (prompt) => {
    queue.enqueue(prompt);
  },
);
```

No coupling. No callback loss.

---

## 4️⃣ Derived reactions (backend-safe side effects)

Side effects live **outside** the store.

```ts
function react<T>(
  store: Store<T>,
  predicate: (diff: StateDiff<T>) => boolean,
  effect: (state: T) => void,
) {
  return store.subscribe((state, diff) => {
    if (predicate(diff)) {
      effect(state);
    }
  });
}
```

Example:

```ts
react(
  store,
  (diff) => diff.changed.includes("prompt"),
  (state) => generationQueue.schedule(state.prompt),
);
```

This ensures:

- effects always see consistent state
- replays work
- no missed triggers

---

## 5️⃣ Why this works for multiple UI elements

Multiple UI components:

- subscribe to the same field
- re-render independently
- cannot race each other

Multiple backend systems:

- observe state transitions
- can debounce / batch / gate logic
- never need to “listen early”

---

## 6️⃣ Comparison to naive pub/sub

| Naive pub/sub       | State-driven         |
| ------------------- | -------------------- |
| Callbacks fire once | State persists       |
| Order-sensitive     | Order-independent    |
| Hard to debug       | Time-travel possible |
| UI tightly coupled  | UI decoupled         |
| Lost events         | Replayable           |

---

## 7️⃣ Optional but powerful upgrades

If you want this to scale further:

### 🔹 Transaction batching

```ts
store.transaction(() => {
  setPrompt("x")(store);
  setTemperature(0.7)(store);
});
```

### 🔹 AbortSignal-aware reactions

```ts
react(store, pred, effect, { signal });
```

### 🔹 Versioned diffs

```ts
diff.version++;
```

### 🔹 Devtools / logging

Every mutation is observable.

---

## The rule of thumb

> **Callbacks mutate.
> Subscriptions observe.
> State is truth.**

Once you structure it this way, you no longer worry about:

- “did this subscriber miss the event?”
- “did this UI component mount too late?”
- “did this backend system attach after the action fired?”

----

Excellent catch — this is exactly the right question to ask. What you noticed is a **notation shortcut**, and if left unexplained it *does* imply a singleton. You do **not** need a singleton dispatcher, but you *do* need to decide **where `dispatch` lives**.

Let’s clear this up properly and give you clean, explicit options.

---

## The core clarification

In the earlier snippet:

```ts
dispatch(setPrompt(textarea.value));
```

`dispatch` was being used as a **bound function**, not a global.

In real code, it must come from **some owning context**.

---

## 1️⃣ The minimal, explicit form (no singleton)

```ts
const dispatcher = new Dispatcher(store);

button.onclick = () => {
  dispatcher.dispatch(setPrompt(textarea.value));
};
```

This is the most honest version.
No magic. No globals.

---

## 2️⃣ Passing a bound `dispatch` (recommended for UI code)

Instead of passing the whole dispatcher around, you pass *just the function*:

```ts
const dispatch = dispatcher.dispatch.bind(dispatcher);
```

UI code:

```ts
button.onclick = () => {
  dispatch(setPrompt(textarea.value));
};
```

Here:

* `dispatch` is a closure
* it is tied to *one* dispatcher
* no singleton involved

This is the pattern used by React, Solid, Redux, etc.

---

## 3️⃣ Dependency injection (clean for larger systems)

You inject dispatch where needed:

```ts
function createUI(dispatch: (a: Action<AppState>) => void) {
  button.onclick = () => {
    dispatch(setPrompt(textarea.value));
  };
}
```

Call site:

```ts
createUI(dispatcher.dispatch.bind(dispatcher));
```

This keeps UI:

* testable
* framework-agnostic
* decoupled from store implementation

---

## 4️⃣ Context-based access (NOT a singleton, but scoped)

If you want convenience without globals:

```ts
class AppContext<T extends object> {
  constructor(
    public store: Store<T>,
    public dispatch: (a: Action<T>) => void
  ) {}
}
```

Usage:

```ts
const app = new AppContext(
  store,
  dispatcher.dispatch.bind(dispatcher)
);
```

UI components receive `app`, not globals.

---

## 5️⃣ What *not* to do (actual singleton)

❌ Don’t do this unless you really want one global app:

```ts
export const dispatch = dispatcher.dispatch.bind(dispatcher);
```

This:

* makes tests harder
* prevents multiple app instances
* causes hidden coupling

---

## 6️⃣ Mental model (important)

> **`dispatch` is an *API*, not a global.**

It’s perfectly fine to *name* the API `dispatch`, but it must be:

* bound to a specific store
* passed explicitly or via context
* not implicitly global

The earlier example assumed this binding for brevity.

---

## 7️⃣ Do you *ever* want a singleton?

Only if:

* you truly have one app instance
* no embedding (QuickJS, workers, tests)
* no multiple backends

Given what you’ve described (UI + backend + queue), **don’t do it**.

---

## TL;DR

* The earlier snippet was shorthand
* No singleton is required
* Use a **bound dispatch function**
* Pass it explicitly or via context