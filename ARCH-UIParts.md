# NAI UIPart Component Architecture Specification

## Status

**Stable / Recommended**

This document defines the canonical component architecture for building reactive, safe, and maintainable UIPart-based user interfaces in the NAI UI system.

It is normative for implementation teams. Deviations must be reviewed explicitly.

---

## 1. Scope & Motivation

The NAI UI system has the following defining characteristics:

- UI updates are **destructive** (missing fields remove UI)
- There is **no diffing or reconciliation**
- Callbacks are tied to specific UI node identities
- `api.v1.ui.update` replaces entire subtrees
- `api.v1.ui.updateParts` mutates existing nodes by ID

This architecture exists to:

- Prevent callback loss
- Preserve stable UI identity
- Enable fine-grained reactivity
- Avoid React-style re-render traps
- Make unsafe patterns impossible by design

---

## 2. Fundamental Principles (Normative)

The following rules are **non-negotiable**:

1. **Structure is created once**
2. **Structure must not depend on reactive state**
3. **Reactivity mutates existing UIParts only**
4. **All UIParts must have deterministic IDs**
5. **Callbacks must never be rebound**
6. **Components are mounted, never re-rendered**

Any violation will eventually cause UI desynchronization or callback invalidation.

---

## 3. Terminology

- **UIExtension**: Top-level UI container registered with `api.v1.ui.register`
- **UIPart**: Structural UI object rendered inside an extension (e.g. box, text, button)
- **Component**: A mounted, reactive unit that owns a UIPart subtree
- **Describe Phase**: One-shot structural definition
- **Bind Phase**: One-shot reactive wiring

This specification is primarily concerned with **UIParts**.

---

## 4. Component Interface

A Component encapsulates structure, identity, reactivity, and events for a UIPart subtree.

```ts
interface Component<Props> {
  /** Stable, deterministic identity */
  id(props: Props): string;

  /** One-shot structural description */
  describe(props: Props): UIPart;

  /** Reactive bindings & effects (runs once) */
  bind(ctx: BindContext, props: Props): void;
}
```

### 4.1 `id(props)`

- Must return the same value for the same domain entity
- Must not depend on reactive state
- Must be deterministic and collision-free

---

### 4.2 `describe(props)` (Structural Phase)

**Purpose:** Define _what exists_.

Rules:

- Runs exactly once per mount
- Must be deterministic
- Must be side-effect free
- Must not access store/state
- Must not create conditional structure

The output of `describe` becomes **authoritative UI structure**.

> Calling `describe` again is illegal except during explicit remount.

---

### 4.3 `bind(ctx, props)` (Reactive Phase)

**Purpose:** Define _how existing structure changes over time_.

Responsibilities:

- Subscribe to store selectors
- Register effects
- Issue `updateParts` calls

Rules:

- Runs exactly once
- Must not create or destroy UIParts
- Must not call `ui.update`
- Must only mutate existing IDs

---

## 5. Bind Context

```ts
interface BindContext {
  useSelector<T>(
    selector: (state: StoreState) => T,
    effect: (value: T) => void,
  ): void;

  updateParts(parts: Partial<UIPart>[]): void;

  useEffect(effect: () => void | (() => void), deps: readonly unknown[]): void;
}
```

---

## 6. Events & Callbacks

Callbacks must:

- Be stable references
- Not capture mutable state
- Be bound once during `describe`

Recommended pattern:

```ts
const events = createEvents({
  edit: (props: { messageId: string }) => {
    dispatch(startEdit(props.messageId));
  },
});
```

Usage in `describe`:

```ts
button({ onClick: events.edit });
```

---

## 7. Mounting & Unmounting

### Mount

```ts
mount(Component, props);
```

Mounting performs:

1. `describe(props)`
2. Registers UIPart into the UI tree
3. `bind(ctx, props)`
4. Activates subscriptions and effects

---

### Unmount

```ts
unmount(Component, props);
```

Unmounting performs:

- Subscription cleanup
- Effect cleanup
- Optional UIPart subtree removal

Unmounting is **explicit**.

---

## 8. IDs (Critical Rules)

IDs must be:

- Deterministic
- Domain-derived
- Stable across updates

Example:

```ts
chat.msg.${messageId}.edit
```

Forbidden:

- Random IDs
- Order-based IDs
- State-derived IDs

If an element has no stable ID, it must not be reactive.

---

## 9. Lists & Reconciliation

- Lists own **structure**
- Items own **behavior**

Structural changes (add/remove):

- Must be explicit
- May use targeted `ui.update` on the list container
- Must preserve stable child IDs

No implicit diffing is performed.

---

## 10. Forbidden Patterns (Normative)

The following are **explicitly forbidden**:

- Re-running `describe` for updates
- Conditional UIPart creation based on state
- Full UI refresh on store changes
- Random or ephemeral IDs
- Rebinding callbacks
- React-style render assumptions

---

## 11. Example 1: Editable Chat Message

### Component Definition

```ts
const ChatMessage: Component<{ messageId: string }> = {
  id: ({ messageId }) => `chat.msg.${messageId}`,

  describe({ messageId }) {
    return box({
      id: `chat.msg.${messageId}`,
      content: [
        text({ id: `chat.msg.${messageId}.view` }),
        textarea({ id: `chat.msg.${messageId}.edit`, hidden: true }),
        button({
          id: `chat.msg.${messageId}.editBtn`,
          onClick: events.edit,
        }),
      ],
    });
  },

  bind({ useSelector, updateParts }, { messageId }) {
    useSelector(
      (s) => s.editingMessageId === messageId,
      (isEditing) => {
        updateParts([
          { id: `chat.msg.${messageId}.view`, hidden: isEditing },
          { id: `chat.msg.${messageId}.edit`, hidden: !isEditing },
        ]);
      },
    );
  },
};
```

---

## 12. Example 2: Message List

```ts
const ChatList: Component<{}> = {
  id: () => "chat.list",

  describe() {
    return box({
      id: "chat.list",
      content: initialMessages.map((msg) =>
        ChatMessage.describe({ messageId: msg.id }),
      ),
    });
  },

  bind({ useSelector }, {}) {
    useSelector(
      (s) => s.messages.map((m) => m.id),
      (ids) => {
        reconcileChildren(ChatMessage, ids);
      },
    );
  },
};
```

---

## 13. Mental Model (Canonical)

> **Components describe what exists.**
> **Bindings describe how it changes.**
> **Nothing is ever re-rendered.**

This mental model is sufficient to reason correctly about the entire system.

---

## 14. Compliance

Any new UI code must:

- Follow this specification
- Use Components for reactive UIParts
- Avoid direct `ui.update` except for structural lifecycle events

Violations should be treated as bugs, not stylistic differences.

---

**End of Specification**

**Reference Implementation**

```typescript
/*
 Reference implementation for the NAI UIPart Component Runtime.

 This code is intentionally explicit and conservative.
 It favors correctness and debuggability over cleverness.
*/

// ---------------------------------------------
// Types (simplified for reference)
// ---------------------------------------------

type UIPart = {
  type: string;
  id?: string;
  [key: string]: any;
};

type Store<State> = {
  getState(): State;
  subscribe(listener: () => void): () => void;
};

// ---------------------------------------------
// Internal registries
// ---------------------------------------------

const mountedComponents = new Map<string, MountedComponent>();
const partCache = new Map<string, UIPart>();

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

  return stable;
}

// ---------------------------------------------
// useSelector
// ---------------------------------------------

export function createUseSelector<State>(store: Store<State>) {
  return function useSelector<T>(
    selector: (state: State) => T,
    effect: (value: T) => void,
  ): () => void {
    let last = selector(store.getState());
    effect(last);

    const unsubscribe = store.subscribe(() => {
      const next = selector(store.getState());
      if (Object.is(next, last)) return;
      last = next;
      effect(next);
    });

    return unsubscribe;
  };
}

// ---------------------------------------------
// updateParts (safe patching layer)
// ---------------------------------------------

/**
 * Safely updates UIParts by merging patches into a cached
 * full representation before calling api.v1.ui.updateParts.
 */
export function updateParts(patches: Partial<UIPart>[]) {
  const fullParts: UIPart[] = [];

  for (const patch of patches) {
    if (!patch.id) {
      throw new Error("updateParts requires all patches to have an id");
    }

    const prev = partCache.get(patch.id);
    if (!prev) {
      throw new Error(`No cached UIPart for id '${patch.id}'`);
    }

    const next = { ...prev, ...patch } as UIPart;
    partCache.set(patch.id, next);
    fullParts.push(next);
  }

  api.v1.ui.updateParts(fullParts);
}

// ---------------------------------------------
// mount
// ---------------------------------------------

interface BindContext<State> {
  useSelector: <T>(
    selector: (state: State) => T,
    effect: (value: T) => void,
  ) => void;
  updateParts: typeof updateParts;
}

interface Component<Props, State = any> {
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
    throw new Error(`Component '${id}' is already mounted`);
  }

  // 1. Describe
  const part = component.describe(props);
  if (!part.id) {
    throw new Error(`describe() must return a UIPart with an id`);
  }

  // Cache entire subtree (shallow for reference impl)
  indexPartTree(part);

  // NOTE: Registration into UIExtensions is assumed to be
  // handled by the caller or a higher-level mountRoot().

  // 2. Bind
  const unsubs: (() => void)[] = [];

  const ctx: BindContext<State> = {
    useSelector(selector, effect) {
      const unsub = createUseSelector(store)(selector, effect);
      unsubs.push(unsub);
    },
    updateParts,
  };

  component.bind(ctx, props);

  mountedComponents.set(id, { id, unsubs });
}

// ---------------------------------------------
// unmount
// ---------------------------------------------

export function unmount<Props>(component: Component<Props>, props: Props) {
  const id = component.id(props);
  const record = mountedComponents.get(id);
  if (!record) return;

  for (const unsub of record.unsubs) unsub();
  mountedComponents.delete(id);
}

// ---------------------------------------------
// Utilities
// ---------------------------------------------

function indexPartTree(part: UIPart) {
  if (!part.id) return;
  partCache.set(part.id, part);

  const children: UIPart[] = part.content ?? [];
  for (const child of children) indexPartTree(child);
}

// ---------------------------------------------
// End of reference implementation
// ---------------------------------------------
```
