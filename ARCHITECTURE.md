You’re circling the real root cause already: **identity instability** combined with **full-tree replacement semantics** in an API that *looks* declarative but behaves *destructively*. The “callbacks getting GC’d” feeling is almost certainly **you replacing the node that owned the callback**, not GC in the JS sense.

Let me frame what’s happening, then give you a concrete architectural path that *fits the NAI UI constraints* instead of fighting them.

---

## What’s Actually Going Wrong (Mental Model)

### 1. Callbacks aren’t disappearing — their owners are

In NAI’s UI system:

* `api.v1.ui.update(...)` **replaces** the component subtree for the given `id`
* If any part is omitted → it is removed
* When a button is replaced, **its callback reference is gone**

So if you do:

```ts
update({
  id: rootId,
  components: [...]
})
```

even *once*, every child callback under that tree must be **re-registered** exactly as before, or they vanish.

That explains:

* Why it happens “casually after an update or two”
* Why it’s not tied to rapid updates
* Why Redux-like reactivity *makes it worse*

This is not a GC issue; it’s **structural replacement**.

---

### 2. Redux-style “re-render on every state change” is mismatched to NAI

Redux + React works because:

* React **diffs**
* Identity is preserved via keys
* Event handlers are rebound automatically

NAI UI:

* No diffing
* No patching
* IDs are semantic identity
* Missing data = deletion

So your instinct is correct: **full UI updates on every store change is the worst possible thing here**.

---

## The Core Rule You Need to Adopt

> **In NAI UI, `update` is a lifecycle operation.
> `updateParts` is a state operation.**

If you internalize that, everything else falls into place.

---

## Recommended Architecture (Concrete, Not Vague)

### 1. Split your UI into two layers

#### A. Structural Layer (rarely changes)

* Created with `api.v1.ui.register`
* Occasionally updated with `api.v1.ui.update`
* Defines:

  * Containers
  * Lists
  * Slots
  * Stable IDs

Think of this as your **DOM skeleton**.

#### B. Behavioral / State Layer (frequently changes)

* Updated **only** with `api.v1.ui.updateParts`
* Never creates or destroys structure
* Only mutates:

  * text
  * disabled
  * value
  * visibility
  * styling flags

---

### 2. IDs must be deterministic and hierarchical

Random IDs are poison here.

You need **structural IDs**, not instance IDs.

Example:

```ts
const ids = {
  root: "ui.root",
  chatList: "ui.chat.list",
  chatItem: (msgId: string) => `ui.chat.msg.${msgId}`,
  chatEdit: (msgId: string) => `ui.chat.msg.${msgId}.edit`,
  chatView: (msgId: string) => `ui.chat.msg.${msgId}.view`,
};
```

This solves:

* `updateParts` targeting
* Nested reactivity
* Callback survival

---

### 3. Render lists structurally, mutate them incrementally

#### Initial register (or rare update):

```ts
api.v1.ui.register([
  {
    id: ids.chatList,
    type: "container",
    children: messages.map(renderChatItemSkeleton),
  }
]);
```

Each `renderChatItemSkeleton(msg)`:

* Includes **both** view and edit components
* Both are always present
* Visibility toggled later

---

### 4. Editing a message does NOT restructure the UI

**Never replace the list or item when editing.**

Instead:

```ts
subscribeSelector(
  state => state.editingMessageId,
  editingId => {
    api.v1.ui.updateParts(
      messages.flatMap(msg => [
        {
          id: ids.chatView(msg.id),
          hidden: msg.id === editingId,
        },
        {
          id: ids.chatEdit(msg.id),
          hidden: msg.id !== editingId,
        }
      ])
    );
  }
);
```

This gives you:

* One message editable at a time
* No callback loss
* No desync
* No list rebuilds

---

### 5. `subscribeSelector` should be *leaf-scoped*, not component-scoped

Your fear that “every reactive component must be mounted” is half-true—but the **mount is logical, not structural**.

Bad:

* Each component subscribes itself
* Dynamic subscribe/unsubscribe tied to rendering

Good:

* **Central UI controller** owns subscriptions
* Subscriptions emit `updateParts`
* Components are dumb descriptors

Think:

```ts
class UIController {
  constructor(store) {
    subscribeSelector(
      s => s.messages,
      this.updateMessageList
    );

    subscribeSelector(
      s => s.editingMessageId,
      this.updateEditingState
    );
  }
}
```

Components do **not** subscribe. The controller does.

---

### 6. When `api.v1.ui.update` is actually OK

Use it only when:

* The *shape* of the UI changes

  * New message added
  * Message removed
  * Tab added
* You can deterministically rebuild the **entire affected subtree**

Even then:

* Prefer updating a **small subtree**, not the root
* Never mix it into high-frequency updates

---

## About Debouncing the Store

Debouncing is a **band-aid**, not a fix.

It helps only if:

* You are stuck doing full updates
* You accept occasional UI lag

But it does NOT:

* Fix callback loss
* Fix identity churn
* Fix nested reactivity

If you adopt the structural/state split above, you probably won’t need it at all.

---

## The Chicken–Egg Problem (Solved Cleanly)

> “`updateParts` needs stable IDs, but IDs are generated at render time”

Solution:

* **IDs are derived from domain data**
* Never generated ad hoc
* Never random

If something has no stable identity:

* It cannot be safely reactive
* Treat it as ephemeral and non-interactive

That’s a harsh rule, but it saves you from ghosts.

---

## TL;DR Architectural Rules

1. **Never re-render interactive components**
2. **Structure once, mutate forever**
3. **IDs are semantic, deterministic, and hierarchical**
4. **`update` = lifecycle**
5. **`updateParts` = state**
6. **Centralize subscriptions**
7. **Visibility > replacement**

---

If you want, next we can:

* Design a **formal “NAI-compatible VDOM” contract**
* Sketch a tiny `mountOnce + updateParts` helper layer
* Refactor one concrete chat example end-to-end

You’re not wrong in your instincts — you’re just fighting an API that punishes React assumptions unless you meet it on its own terms.
