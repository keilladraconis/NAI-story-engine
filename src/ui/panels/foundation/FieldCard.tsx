// One Foundation field row: label + derived display text + an actions row
// (optional Sync toggle, Zap, Edit). The Zap adapts: empty field generates,
// filled field refines (decideFieldAction), except Shape which is generate-only
// (descriptor.hasRefine === false). While a matching foundation request is
// queued/active the Zap is disabled and dimmed. All differences come from the
// descriptor — one render path.

import { useSlice, useStream } from "../../bridge";
import { T, SP } from "../../style";
import { useTapGuard } from "../../tap-guard";
import { Zap, Edit, ToggleLeft, ToggleRight } from "nai:icons/feather";
import {
  store,
  uiChatRefineRequested,
  uiEditableActivate,
} from "../../../core/store";
import { decideFieldAction } from "../chat/chat-actions";
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

  // A tap can deliver `click` twice. The sync toggle flips a boolean, so an
  // unguarded repeat flips it straight back — the switch looks stuck and the
  // Memory/A.N. write runs twice. The Zap would queue two generations.
  // Separate guards so tapping one button never swallows the other.
  const onceSyncTap = useTapGuard();
  const onceZapTap = useTapGuard();

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
              onClick={() => onceSyncTap(() => d.toggleSync?.())}
              style={{ background: "none", border: "none", cursor: "pointer" }}
            >
              {syncEnabled ? (
                <ToggleRight size={ICON_SIZE} color={T.midIntensity} />
              ) : (
                <ToggleLeft size={ICON_SIZE} style={{ opacity: 0.45 }} />
              )}
            </button>
          ) : null}
          <button
            title={generating ? "Generating…" : "Generate"}
            onClick={() => onceZapTap(onZap)}
            disabled={generating}
            style={{
              background: "none",
              border: "none",
              cursor: generating ? "default" : "pointer",
              opacity: generating ? 0.4 : 1,
            }}
          >
            <Zap size={ICON_SIZE} />
          </button>
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
