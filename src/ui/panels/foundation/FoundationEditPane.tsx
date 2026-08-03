// Foundation field edit pane. Routed from StoryEngine off the shared
// ui.activeEditId singleton (same as the entity and thread panes) so opening a
// field editor takes over the whole Story Engine tab instead of only replacing
// the Foundation list. Seeds from the committed store value at mount
// (descriptor.seed) and commits back through descriptor.commit.

import { store, uiEditableDeactivate } from "../../../core/store";
import { FieldEditor } from "./FieldEditor";
import type { FieldDescriptor } from "./fields";

export function FoundationEditPane(props: { descriptor: FieldDescriptor }) {
  const d = props.descriptor;
  const draft = d.seed(store.getState());
  const close = () => store.dispatch(uiEditableDeactivate());

  return (
    <FieldEditor
      label={`Edit ${d.label}`}
      titled={d.titled}
      initialTitle={draft.title}
      initialContent={draft.content}
      placeholder={d.placeholder}
      titlePlaceholder={d.titlePlaceholder}
      onBack={close}
      onCommit={(v) => {
        d.commit(v);
        close();
      }}
    />
  );
}
