// One Foundation field row: label + derived display text + an actions row
// (optional Sync toggle, generate/refine button, Edit). That button adapts:
// empty field generates (⚡), filled field refines (quill) — decideFieldAction
// picks both the glyph and the dispatch — except Shape which is generate-only
// (descriptor.hasRefine === false). While a matching foundation request is
// queued/active the button is disabled and dimmed. All differences come from the
// descriptor — one render path.

import { useSlice, useStream } from "../../bridge";
import { T, SP } from "../../style";
import { Edit, ToggleLeft, ToggleRight } from "nai:icons/feather";
import {
  store,
  uiChatRefineRequested,
  uiEditableActivate,
} from "../../../core/store";
import { decideFieldAction } from "../chat/chat-actions";
import {
  GenerateButton,
  type GenerateMode,
} from "../../components/GenerateButton";
import { type FieldDescriptor, isFoundationGenerating } from "./fields";

const ICON_SIZE = 16;

export function FieldCard(props: { descriptor: FieldDescriptor }) {
  const d = props.descriptor;
  const label = useSlice((s) => d.cardLabel(s));
  // While generating, show the live per-token text from the effect-free buffer;
  // on completion the handler clears it and we fall back to the committed
  // (formatted) store value. Mirrors the chat bubble.
  const storeValue = useSlice((s) => d.display(s));
  const live = useStream(`foundation:${d.id}`);
  const value = live ?? storeValue;
  const generating = useSlice((s) => isFoundationGenerating(s, d.id));
  const syncEnabled = useSlice((s) =>
    d.syncEnabled ? d.syncEnabled(s) : false,
  );
  // Which action a press will take, subscribed so the glyph follows the field's
  // content live. onZap re-reads the store at click time rather than closing
  // over this, so the dispatch is decided from state as it is when pressed.
  const refineSource = useSlice((s) => (d.hasRefine ? d.refineSource(s) : ""));
  const mode: GenerateMode = d.hasRefine
    ? decideFieldAction(refineSource)
    : "generate";

  const onZap = () => {
    if (generating) return;
    if (!d.hasRefine) {
      d.generate();
      return;
    }
    const text = d.refineSource(store.getState());
    if (decideFieldAction(text) === "generate") {
      d.generate();
    } else {
      store.dispatch(
        uiChatRefineRequested({ fieldId: d.id, sourceText: text }),
      );
    }
  };

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
        <span style={{ color: T.textHeadings }}>{label}</span>
        <div style={{ display: "flex", gap: SP.sm }}>
          {d.hasSync ? (
            <button
              title="Sync to Memory / A.N."
              onClick={() => d.toggleSync?.()}
              style={{ background: "none", border: "none", cursor: "pointer" }}
            >
              {syncEnabled ? (
                <ToggleRight size={ICON_SIZE} color={T.midIntensity} />
              ) : (
                <ToggleLeft size={ICON_SIZE} style={{ opacity: 0.45 }} />
              )}
            </button>
          ) : null}
          <GenerateButton
            mode={mode}
            title="Generate"
            pending={generating}
            size={ICON_SIZE}
            onClick={onZap}
          />
          <button
            title="Edit"
            onClick={() => store.dispatch(uiEditableActivate({ id: d.id }))}
            style={{ background: "none", border: "none", cursor: "pointer" }}
          >
            <Edit size={ICON_SIZE} />
          </button>
        </div>
      </div>
      <div
        style={{
          whiteSpace: "pre-wrap",
          color: value ? T.text : T.textDisabled,
        }}
      >
        {value || "(empty)"}
      </div>
    </div>
  );
}
