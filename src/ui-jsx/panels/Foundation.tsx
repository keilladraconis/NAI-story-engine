// Proof panel: Foundation ATTG + Style. Cards render reactively from nai-store;
// Generate/Sync dispatch actions; Edit opens an inline edit pane whose textarea
// seeds from the committed store value (useDraftField). Parity target for SUI's
// SeFoundationSection ATTG/Style.

import { useSlice } from "../bridge";
import { useDraftField } from "../hooks";
import { T, SP } from "../style";
import { Zap, Edit, ToggleLeft, ToggleRight, ArrowLeft } from "nai:icons/feather";
import {
  store,
  attgUpdated,
  styleUpdated,
  attgGenerationRequested,
  styleGenerationRequested,
  attgSyncToggled,
  styleSyncToggled,
  uiChatRefineRequested,
} from "../../core/store";
import { decideFieldAction } from "./chat/chat-actions";

// Card-header action icons; smaller than feather's 24px default to fit the row.
const ICON_SIZE = 16;

function runFieldZap(
  fieldId: "attg" | "style",
  text: string,
  generate: () => void,
): void {
  if (decideFieldAction(text) === "generate") {
    generate();
  } else {
    store.dispatch(uiChatRefineRequested({ fieldId, sourceText: text }));
  }
}

// Mirrors SeFoundationSection._syncMemory: push to Memory / A.N. when the
// per-field sync toggle is on.
async function syncMemory(): Promise<void> {
  const { attg, style, attgSyncEnabled, styleSyncEnabled } =
    store.getState().foundation;
  if (attgSyncEnabled) await api.v1.memory.set(attg.trim());
  if (styleSyncEnabled) await api.v1.an.set(style.trim());
}

type FieldEditorProps = {
  label: string;
  initial: string;
  placeholder: string;
  onCommit: (value: string) => void;
  onBack: () => void;
};

function FieldEditor(props: FieldEditorProps) {
  const { value, setValue } = useDraftField(props.initial);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SP.sm }}>
      {/* Header row: [← Back] title [Save] — mirrors SeSimpleContentPane. */}
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
          onClick={() => props.onCommit(value.trim())}
          style={{ padding: "4px 16px" }}
        >
          Save
        </button>
      </div>
      {/* Uncontrolled: a <textarea> renders its child text, NOT a `value`
          attribute (NovelAI's renderer applies value via setAttribute, which
          textarea ignores). Seed display from the stable committed `initial` so
          re-renders don't reset the caret; `useDraftField` tracks edits via
          onInput for Save. */}
      <textarea
        placeholder={props.placeholder}
        rows={6}
        onInput={(e) => setValue(e.target.value ?? "")}
        style={{
          background: T.bg2,
          color: T.text,
          fontFamily: T.fontDefault,
          padding: SP.md,
          border: "none",
          resize: "vertical",
        }}
      >
        {props.initial}
      </textarea>
    </div>
  );
}

type CardProps = {
  label: string;
  value: string;
  syncEnabled: boolean;
  onEdit: () => void;
  onGenerate: () => void;
  onToggleSync: () => void;
};

function FieldCard(props: CardProps) {
  return (
    <div
      style={{
        background: T.bg2,
        color: T.text,
        fontFamily: T.fontDefault,
        padding: SP.md,
        display: "flex",
        flexDirection: "column",
        gap: SP.sm,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span style={{ color: T.textHeadings }}>{props.label}</span>
        <div style={{ display: "flex", gap: SP.sm }}>
          <button
            title="Sync to Memory / A.N."
            onClick={props.onToggleSync}
            style={{ background: "none", border: "none", cursor: "pointer" }}
          >
            {props.syncEnabled ? (
              <ToggleRight size={ICON_SIZE} color={T.midIntensity} />
            ) : (
              <ToggleLeft size={ICON_SIZE} style={{ opacity: 0.45 }} />
            )}
          </button>
          <button
            title="Generate"
            onClick={props.onGenerate}
            style={{ background: "none", border: "none", cursor: "pointer" }}
          >
            <Zap size={ICON_SIZE} />
          </button>
          <button
            title="Edit"
            onClick={props.onEdit}
            style={{ background: "none", border: "none", cursor: "pointer" }}
          >
            <Edit size={ICON_SIZE} />
          </button>
        </div>
      </div>
      <div style={{ whiteSpace: "pre-wrap", color: props.value ? T.text : T.textDisabled }}>
        {props.value || "(empty)"}
      </div>
    </div>
  );
}

export function Foundation() {
  const attg = useSlice((s) => s.foundation.attg);
  const style = useSlice((s) => s.foundation.style);
  const attgSync = useSlice((s) => s.foundation.attgSyncEnabled);
  const styleSync = useSlice((s) => s.foundation.styleSyncEnabled);
  const [editing, setEditing] = useState<"attg" | "style" | null>(null);

  if (editing === "attg") {
    return (
      <FieldEditor
        label="Edit ATTG"
        initial={attg}
        placeholder="Author, Title, Tags, Genre…"
        onBack={() => setEditing(null)}
        onCommit={(v) => {
          store.dispatch(attgUpdated({ attg: v }));
          void syncMemory();
          setEditing(null);
        }}
      />
    );
  }
  if (editing === "style") {
    return (
      <FieldEditor
        label="Edit Style"
        initial={style}
        placeholder="Writing style, tone, prose directives…"
        onBack={() => setEditing(null)}
        onCommit={(v) => {
          store.dispatch(styleUpdated({ style: v }));
          void syncMemory();
          setEditing(null);
        }}
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SP.md }}>
      <FieldCard
        label="ATTG"
        value={attg}
        syncEnabled={attgSync}
        onEdit={() => setEditing("attg")}
        onGenerate={() =>
          runFieldZap("attg", attg, () => store.dispatch(attgGenerationRequested()))
        }
        onToggleSync={() => {
          store.dispatch(attgSyncToggled());
          void syncMemory();
        }}
      />
      <FieldCard
        label="Style"
        value={style}
        syncEnabled={styleSync}
        onEdit={() => setEditing("style")}
        onGenerate={() =>
          runFieldZap("style", style, () => store.dispatch(styleGenerationRequested()))
        }
        onToggleSync={() => {
          store.dispatch(styleSyncToggled());
          void syncMemory();
        }}
      />
    </div>
  );
}
