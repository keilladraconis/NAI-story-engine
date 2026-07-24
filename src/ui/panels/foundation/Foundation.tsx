// Story Engine tab body. Renders the Intensity picker then one FieldCard per
// descriptor. `editing` holds the field id whose edit pane is open; while set,
// the pane replaces the list. The pane seeds from the committed store value at
// open time (descriptor.seed) and commits back through descriptor.commit.

import { store } from "../../../core/store";
import { SP } from "../../style";
import { IntensityPicker } from "./IntensityPicker";
import { FieldCard } from "./FieldCard";
import { FieldEditor } from "./FieldEditor";
import { FIELD_DESCRIPTORS, type FoundationFieldId } from "./fields";

export function Foundation() {
  const [editing, setEditing] = useState<FoundationFieldId | null>(null);

  if (editing) {
    const d = FIELD_DESCRIPTORS.find((x) => x.id === editing)!;
    const draft = d.seed(store.getState());
    return (
      <FieldEditor
        label={`Edit ${d.label}`}
        titled={d.titled}
        initialTitle={draft.title}
        initialContent={draft.content}
        placeholder={d.placeholder}
        titlePlaceholder={d.titlePlaceholder}
        onBack={() => setEditing(null)}
        onCommit={(v) => {
          d.commit(v);
          setEditing(null);
        }}
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SP.md }}>
      <IntensityPicker />
      {FIELD_DESCRIPTORS.map((d) => (
        <FieldCard key={d.id} descriptor={d} onEdit={() => setEditing(d.id)} />
      ))}
    </div>
  );
}
