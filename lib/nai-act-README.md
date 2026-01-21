# NAIAct

**NAIAct** is a small, disciplined runtime for building **interactive NovelAI Script UIs** on top of NovelAI’s **retained, imperative UI API**.

NAIAct exists to solve one problem well:

> How do you bind application state to a retained UI _without_ re-rendering structure, leaking lifecycle bugs, or introducing implicit global state?

NAIAct borrows ideas from React and Redux, but it is **not a React clone**. There is no virtual DOM, no render loop, and no reconciliation. Instead, NAIAct enforces a strict separation between **structure**, **state**, and **behavior**.

---

## What NAIAct Is (and Is Not)

### NAIAct **is**

- a lightweight component abstraction over `UIPart`
- a binding layer between a store and the NovelAI UI API
- a lifecycle helper for subscriptions and effects
- explicit, synchronous, and multi-file safe

### NAIAct **is not**

- a virtual DOM
- a renderer
- a diffing engine
- a state store

You provide the store. NAIAct binds UI parts to it.

---

## The Core Mental Model (Read This First)

NAIAct enforces a **three-phase model**:

1. **Describe** UI structure (pure)
2. **Register** UIExtensions (NovelAI API)
3. **Bind** behavior to state

These phases are deliberately separate.

- UI structure is static
- State changes drive targeted updates
- Behavior is attached exactly once

If you blur these phases, subtle bugs reappear.

---

## UIExtensions vs UIParts

### UIExtensions

- top-level containers (e.g. `scriptPanel`)
- registered via `api.v1.ui.register`
- registered once

### UIParts

- buttons, text, rows, columns, inputs
- live inside a UIExtension
- updated via `api.v1.ui.updateParts`

> **NAIAct components describe UIParts, not UIExtensions.**

---

## Components

A **Component** is a small unit that binds state to UI.

```ts
interface Component<Props = void, S = any, A = any> {
  id(props: Props): string;
  describe(props: Props): UIPart;
  bind(props: Props, ctx: BindContext<S, A>): void;
}
```

### What a Component _is_

> A Component is a **reactor**: it observes state and issues targeted UI updates.

### What a Component is _not_

- not a UI owner
- not a UI namespace
- not a lifecycle registry
- not responsible for coordinating other components

Coordination happens through the **store**.

---

## Container vs Leaf Components (Important)

Because NovelAI’s UI is **retained**:

- updating a container’s `content` **replaces it entirely**
- leaf properties (`text`, `disabled`, etc.) can be patched incrementally

This leads to a clear rule:

> **Container components react to _structural_ state.**  
> **Leaf components react to _leaf_ state.**

Both are coordinated by the store.

---

## The Store Contract

NAIAct works with any store implementing:

```ts
interface Store<S, A = any> {
  getState(): S;
  dispatch(action: A): void;
  subscribeSelector<T>(
    selector: (state: S) => T,
    listener: (value: T, action: A) => void,
  ): () => void;
}
```

Key properties:

- selector-based subscriptions
- listeners fire only on change
- updates are synchronous

---

## BindContext (Explicit, No Globals)

All behavior is attached through an explicit **BindContext**.

```ts
interface BindContext<S, A = any> {
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
}
```

There are:

- no global stores
- no ambient hooks
- no implicit lifecycle state

Everything is explicit and testable.

---

## Event Callbacks and `createEvents`

UI callbacks must exist during `describe()`, but behavior that uses the store can only be attached during `bind()`.

`createEvents()` bridges that gap by creating **stable callback identities**.

```ts
const events = createEvents<{ click(): void }>();
```

- callbacks are safe to pass to the UI
- behavior is attached later during `bind()`

---

## Canonical Example: Counter

This is the smallest useful NAIAct component. It demonstrates the full flow:

- static structure via `describe`
- behavior via `bind`
- state coordination via the store

---

### State

```ts
type State = { count: number };
```

---

### Reducer

```ts
const reducer = combineReducers<State>({
  count(state = 0, action) {
    if (action.type === "INC") return state + 1;
    return state;
  },
});
```

---

### Counter Component

```ts
const Counter = {
  id: () => "counter",

  events: createEvents<{ inc(): void }>(),

  describe() {
    return api.v1.ui.part.button({
      id: this.id(),
      text: "Count: 0",
      callback: this.events.inc,
    });
  },

  bind(_props, ctx) {
    this.events.attach({
      inc() {
        ctx.dispatch({ type: "INC" });
      },
    });

    ctx.useSelector(
      (s) => s.count,
      (count) => {
        api.v1.ui.updateParts([{ id: this.id(), text: `Count: ${count}` }]);
      },
    );
  },
};
```

---

### Mounting

```ts
const store = createStore({
  initialState: { count: 0 },
  reducer,
});

await api.v1.ui.register([
  api.v1.ui.extension.scriptPanel({
    id: "panel",
    name: "Counter",
    content: [Counter.describe()],
  }),
]);

mount(Counter, {}, store);
```

---

## Canonical Example: Todo List (Full Lifecycle)

This example demonstrates:

- dynamic structure
- item creation and deletion
- container vs leaf responsibilities
- full mount → update → unmount lifecycle

---

### State

```ts
type Todo = { id: string; text: string };

type State = {
  todos: Todo[];
};
```

---

### Reducer

```ts
const reducer = combineReducers<State>({
  todos(state = [], action) {
    switch (action.type) {
      case "ADD_TODO":
        return [...state, { id: action.id, text: action.text }];
      case "REMOVE_TODO":
        return state.filter((t) => t.id !== action.id);
      default:
        return state;
    }
  },
});
```

---

### TodoList (Container Component)

```ts
const TodoList: Component<void, State> = {
  id: () => "todo-list",

  describe() {
    return api.v1.ui.part.column({
      id: this.id(),
      content: [],
    });
  },

  bind(_props, ctx) {
    const mounted = new Map<string, () => void>();

    ctx.useSelector(
      (s) => s.todos.map((t) => t.id),
      (ids) => {
        api.v1.ui.updateParts([
          {
            id: this.id(),
            content: ids.map((id) => TodoItem.describe({ id })),
          },
        ]);

        for (const id of ids) {
          if (!mounted.has(id)) {
            mounted.set(id, ctx.mount(TodoItem, { id }));
          }
        }

        for (const [id, unmount] of mounted) {
          if (!ids.includes(id)) {
            unmount();
            mounted.delete(id);
          }
        }
      },
    );
  },
};
```

This component:

- reacts to structural state (`todos` membership)
- replaces container content
- mounts and unmounts item components explicitly

---

### TodoItem (Leaf Component)

```ts
const todoItemEvents = createEvents<{ remove(): void }>();
const TodoItem: Component<{ id: string }, State> = {
  id: (props: { id: string }) => `todo:${props.id}`,

  describe(props: { id: string }) {
    return api.v1.ui.part.row({
      content: [
        api.v1.ui.part.textInput({
          storageKey: this.id(props),
          placeholder: "I want Todo...",
        }),
        api.v1.ui.part.button({
          text: "✕",
          callback: todoItemEvents.remove,
        }),
      ],
    });
  },

  bind(props: { id: string }, ctx) {
    todoItemEvents.attach({
      remove() {
        ctx.dispatch({ type: "REMOVE_TODO", id: props.id });
      },
    });
  },
};
```

---

### AddTodoButton

```ts
const addTodoButtonEvents = createEvents<{ add(): void }>();
const AddTodoButton: Component<void, State> = {
  id: () => "add-todo",
  describe() {
    return api.v1.ui.part.button({
      id: "add-todo",
      text: "Add Todo",
      callback: addTodoButtonEvents.add,
    });
  },

  bind(_, ctx) {
    addTodoButtonEvents.attach({
      add() {
        ctx.dispatch({
          type: "ADD_TODO",
          id: api.v1.uuid(),
          text: "New todo",
        });
      },
    });
  },
};
```

---

### Register and Mount

```ts
await api.v1.ui.register([
  api.v1.ui.extension.scriptPanel({
    id: "panel",
    name: "Todos",
    content: [TodoList.describe(), AddTodoButton.describe()],
  }),
]);

const store = createStore<State>({
  initialState: { todos: [] },
  reducer,
});

mount(TodoList, {}, store);
mount(AddTodoButton, {}, store);
```

---

## Streaming vs State

Do **not** dispatch high-frequency streaming data.

```ts
let text = "";

for await (const chunk of stream) {
  text += chunk;
  api.v1.ui.updateParts([{ id: "output", text }]);
}
```

State is for **meaningful transitions**, not render loops.

---

## Final Rule of Thumb

> **Structure is static. State coordinates. Components react.**
