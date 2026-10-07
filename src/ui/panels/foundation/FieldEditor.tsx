// Foundation edit pane: one textarea. Uncontrolled: child text seeds the
// display from the committed store value; onInput tracks edits via
// useDraftField. Save hands back the draft (its title is always empty).
// Layout mirrors EntityEditPane: the pane fills the panel height so the content
// textarea can grow to the bottom.

import { useDraftField } from "../../hooks";
import { T, SP } from "../../style";
import { ArrowLeft } from "nai:icons/feather";
import type { FieldDraft } from "./fields";

const ICON_SIZE = 16;

type FieldEditorProps = {
  label: string;
  initialContent: string;
  placeholder: string;
  onCommit: (draft: FieldDraft) => void;
  onBack: () => void;
};

export function FieldEditor(props: FieldEditorProps) {
  const content = useDraftField(props.initialContent);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: SP.sm,
        // Fill the pane height so the content textarea can grow to the bottom.
        // Grows past the panel if the header wraps (the engine tab
        // scrolls); the textarea scrolls its own overflow.
        minHeight: "100%",
        paddingBottom: SP.sm,
      }}
    >
      {/* Header row: [← Back] label [Save] */}
      <div style={{ display: "flex", alignItems: "center", gap: SP.sm }}>
        <button
          title="Back"
          onClick={props.onBack}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: T.text,
            display: "flex",
            alignItems: "center",
            padding: 0,
          }}
        >
          <ArrowLeft size={ICON_SIZE} />
        </button>
        <span style={{ flex: 1, color: T.textHeadings, fontWeight: "bold" }}>
          {props.label}
        </span>
        <button
          onClick={() =>
            props.onCommit({
              title: "",
              content: content.value.trim(),
            })
          }
          style={{ padding: "4px 16px" }}
        >
          Save
        </button>
      </div>

      <textarea
        placeholder={props.placeholder}
        onInput={(e) => content.setValue(e.target.value ?? "")}
        // flex:1 fills the pane down to the bottom; minHeight keeps it usable
        // when the panel is short; the textarea scrolls its own overflow.
        style={{
          background: T.bg2,
          color: T.text,
          fontFamily: T.fontDefault,
          padding: SP.md,
          border: "none",
          flex: 1,
          minHeight: "8em",
          resize: "none",
        }}
      >
        {props.initialContent}
      </textarea>
    </div>
  );
}
