# NAIStore

**NAIStore** is a small, synchronous state management library designed for **NovelAI scripts** and similar single-threaded JavaScript environments.

It provides a predictable way to manage application state using:

- Reducers
- Actions
- Selector-based subscriptions
- Explicit side effects (Effects)

NAIStore is intentionally minimal, dependency-free, and safe to embed directly into a script without build tooling.

---

## Why NAIStore?

NovelAI scripts often need to manage state such as:

- Configuration options
- Script modes
- UI selections
- Message lists
- Generation metadata
- Persistent counters

NAIStore exists to make that state:

- Centralized
- Predictable
- Easy to reason about
- Cheap to observe

It avoids abstractions that are unnecessary or harmful in a scripting environment.

---

## Design Principles

NAIStore is built around a few strict principles:

- **State updates are synchronous**
- **Effects are synchronously invoked**
- **Reducers are pure**
- **Subscriptions are selector-based**
- **Side effects are explicit**
- **No framework or rendering assumptions**

This makes NAIStore suitable for:

- UI scripts
- Background logic
- Generator hooks
- Mono-script environments

---

## Installation

NAIStore is designed to be **copied directly into your script**.

There is no required module system, bundler, or runtime dependency.

Typical usage is a single file containing:

- Store implementation
- Reducers
- Script logic

---

## Performance Notes

NAIStore is synchronous and efficient, but it is **not designed for high-frequency updates**.

Do **not** dispatch:

- Token streams
- Partial text updates
- Animation frames
- Rapid progress updates

Handle those imperatively instead.

---

## What NAIStore Is Not

NAIStore is **not**:

- A UI framework
- A rendering system
- An async scheduler
- A streaming transport
- A replacement for imperative logic

It is a tool for **semantic application state**.

---

## Core Concepts

### Actions

Actions are plain objects that describe _what happened_.

```ts
type Action = {
  type: string;
  [key: string]: any;
};
```

Example:

```ts
{ type: "SET_MODE", mode: "edit" }
```

Actions are the _only_ way state changes enter the system.

---

### Reducers

Reducers are pure functions that compute the next state.

```ts
type Reducer<S> = (state: S, action: Action) => S;
```

Reducers:

- Must not mutate state
- Must not perform side effects
- Must always return a state value

Reducers define _what the state is_, nothing more.

---

## Creating a Store

```ts
const store = createStore({
  initialState: { count: 0 },
  reducer,
});
```

A store owns:

- The current state
- The reducer
- Subscriptions
- Effects

---

## Reading State

```ts
const state = store.getState();
```

This is synchronous and side-effect free.

---

## Dispatching Actions

```ts
store.dispatch({ type: "INC" });
```

Dispatching an action:

1. Runs the reducer
2. Updates state if it changed
3. Notifies selector subscribers
4. Runs effects

Reducer execution, subscriptions, and effect invocation all happen synchronously and in order.

---

## Selector Subscriptions (Reactive Logic)

NAIStore supports **selector-based subscriptions**.

```ts
store.subscribeSelector(
  (state) => state.count,
  (count, action) => {
    console.log("Count changed to:", count);
  },
);
```

The first argument, the _selector_ function, receives state as an argument and returns a value or object representing the **selection**, meaning, the part of the state which the listener will recieve _when the **selection** changes_. The selection can be any object in any shape, a list, or even a reduction of values. It is only important that it indicates the change you are listening for. It is beneficial to your listener if the **selection** is also a useful literal.

### Why selectors?

Selectors ensure that:

- Subscribers only run when _relevant data_ changes
- Unrelated updates are ignored
- Performance remains predictable

Selectors are compared using `Object.is`.

---

### What selector subscriptions are for

Use `subscribeSelector` for:

- UI updates
- Derived values
- Synchronizing multiple consumers
- Reacting to _state changes_

If your logic depends on _what the state is_, use a selector.

---

## Effects (Side Effects)

Effects allow you to respond to **actions** with **imperative behavior**.

```ts
const store = createStore({
  initialState,
  reducer,
  effects: [
    (action, ctx) => {
      if (action.type === "SAVE") {
        api.v1.storage.set("state", ctx.getState());
      }
    },
  ],
});
```

### What Effects are

An **Effect** is a synchronous function that:

- Runs **after every dispatch**
- Receives the dispatched action
- Can read the current state
- May perform side effects, including initiating async work
- May dispatch additional actions

Effects are **action-driven**, not state-driven.

---

### What Effects are NOT

Effects are **not**:

- Reactive subscriptions
- A replacement for selectors
- A place for derived state
- A rendering mechanism

If you need to react to _state changes_, use `subscribeSelector`.

If you need to react to _why something happened_, use an Effect.

---

### Effect execution rules

Effects:

- Run after the reducer completes
- Run synchronously
- Run for every dispatched action
- Must never mutate state directly

Because Effects run on every dispatch, they **must be guarded**:

```ts
effects: [
  (action, ctx) => {
    if (action.type !== "SAVE") return;
    api.v1.storage.set("state", ctx.getState());
  },
];
```

---

### Effects and Asynchronous APIs

Effects are invoked synchronously after each dispatch, but they may initiate
**asynchronous work**.

NAIStore does **not** await effects or track their completion.

This means:

- Effects may call async APIs (such as NovelAI storage or network calls)
- Effects must not `await` as part of the store lifecycle
- Any result of async work must re-enter the system via a new action

Example:

```ts
effects: [
  (action, ctx) => {
    if (action.type !== "SAVE") return;

    void api.v1.storage.set("state", ctx.getState()).catch((err) => {
      ctx.dispatch({ type: "SAVE_FAILED", error: String(err) });
    });
  },
];
```

> **Important**
> Dispatch order is deterministic.  
> Asynchronous completion order is not.
>
> Always model async results as actions.

---

### Dispatching from Effects

Effects may dispatch additional actions:

```ts
effects: [
  (action, ctx) => {
    if (action.type === "SUBMIT") {
      ctx.dispatch({ type: "SAVE" });
    }
  },
];
```

**Important:**
Effects must be written to avoid infinite loops.
Always guard by action type or state.

---

### When to use Effects

Use Effects for:

- Persistence
- Logging
- Analytics
- External API calls
- Integrating with NovelAI APIs
- One-shot reactions to semantic events

---

## Mental Model Summary

> **Reducers decide what the state is.**
> **Selectors decide who cares.**
> **Effects decide what the outside world needs to know.**
> **Async results always come back as actions.**

Keeping these responsibilities separate is the key to using NAIStore correctly.

---

## Managing Larger State with `combineReducers`

For larger scripts, split state into logical slices.

```ts
const reducer = combineReducers({
  mode: modeReducer,
  messages: messagesReducer,
  runCount: runCountReducer,
});
```

Each slice reducer:

- Owns its portion of state
- Is pure
- Knows nothing about other slices

---

## Concrete Examples

This section provides two complete examples showing how NAIStore is intended to be used in practice.

---

### Example 1: Simple Counter (Purely Synchronous)

This example demonstrates the core data flow:

- Actions describe intent
- Reducers update state
- Selectors react to state changes
- No side effects

```ts
type State = {
  count: number;
};

const initialState: State = { count: 0 };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "INC":
      return { count: state.count + 1 };
    case "DEC":
      return { count: state.count - 1 };
    default:
      return state;
  }
}

const store = createStore({
  initialState,
  reducer,
});

store.subscribeSelector(
  (state) => state.count,
  (count) => {
    console.log("Count is now:", count);
  },
);

store.dispatch({ type: "INC" });
store.dispatch({ type: "INC" });
store.dispatch({ type: "DEC" });
```

**What this shows:**

- Reducers are pure and synchronous
- Subscriptions only run when selected data changes
- Dispatch order is predictable

This is the simplest and most common NAIStore usage.

---

## Example 2: TODO List with Persistent Storage (Async Effect + `combineReducers`)

This example demonstrates:

- Splitting state into logical slices
- Using `combineReducers`
- Modeling async persistence via an Effect
- Keeping reducers pure and synchronous

---

### State Slices and Reducers

```ts
type Todo = {
  id: number;
  text: string;
  done: boolean;
};

type TodosState = {
  items: Todo[];
};

type MetaState = {
  nextId: number;
};

const initialTodosState: TodosState = {
  items: [],
};

const initialMetaState: MetaState = {
  nextId: 1,
};

function todosReducer(
  state: TodosState = initialTodosState,
  action: Action,
): TodosState {
  switch (action.type) {
    case "ADD_TODO":
      return {
        items: [
          ...state.items,
          {
            id: action.id,
            text: action.text,
            done: false,
          },
        ],
      };

    case "TOGGLE_TODO":
      return {
        items: state.items.map((t) =>
          t.id === action.id ? { ...t, done: !t.done } : t,
        ),
      };

    case "SET_TODOS":
      return {
        items: action.todos,
      };

    default:
      return state;
  }
}

function metaReducer(
  state: MetaState = initialMetaState,
  action: Action,
): MetaState {
  switch (action.type) {
    case "ADD_TODO":
      return { nextId: state.nextId + 1 };
    default:
      return state;
  }
}
```

---

### Combined Reducer and Store

```ts
const reducer = combineReducers({
  todos: todosReducer,
  meta: metaReducer,
});

type State = ReturnType<typeof reducer>;

const store = createStore({
  initialState: {
    todos: initialTodosState,
    meta: initialMetaState,
  },
  reducer,
  effects: [
    (action, ctx) => {
      if (action.type !== "ADD_TODO" && action.type !== "TOGGLE_TODO") {
        return;
      }

      // Persist todos asynchronously
      void api.v1.storage
        .set("todos", ctx.getState().todos.items)
        .catch((err) => {
          console.error("Failed to save todos:", err);
        });
    },
  ],
});
```

---

### Reacting to State Changes

```ts
store.subscribeSelector(
  (state) => state.todos.items,
  (todos) => {
    console.log("Todos updated:", todos);
  },
);
```

---

### Dispatching Actions

```ts
store.dispatch({
  type: "ADD_TODO",
  id: store.getState().meta.nextId,
  text: "Write documentation",
});

store.dispatch({
  type: "ADD_TODO",
  id: store.getState().meta.nextId,
  text: "Ship feature",
});

store.dispatch({
  type: "TOGGLE_TODO",
  id: 1,
});
```

---

### Optional: Loading Initial State from Storage

Async loading happens outside the store and re-enters via an action:

```ts
void api.v1.storage.get("todos").then((todos) => {
  if (Array.isArray(todos)) {
    store.dispatch({ type: "SET_TODOS", todos });
  }
});
```

---

### What this shows:

- State is split into **independent slices**
- `combineReducers` composes them predictably
- Effects handle async integration
- Async completion is represented as actions
- The store remains fully synchronous
