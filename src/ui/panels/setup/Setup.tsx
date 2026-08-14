// Setup tab body — where a story starts.
//
// Owns the Foundation fields, the bootstrap button, and the Import wizard. Like
// the Engine tab it routes panes by membership over the shared ui.activeEditId
// singleton, but it only claims Foundation field ids; entity and thread ids
// belong to Engine.tsx. The wizard yields to an open edit pane, matching the
// priority order Engine.tsx uses.

import { useSlice } from "../../bridge";
import {
  store,
  importWizardOpened,
  importWizardClosed,
} from "../../../core/store";
import { SP, T } from "../../style";
import { Foundation } from "../foundation/Foundation";
import { FoundationEditPane } from "../foundation/FoundationEditPane";
import { FIELD_DESCRIPTORS } from "../foundation/fields";
import { ImportWizard } from "../import/ImportWizard";
import { BootstrapButton } from "./BootstrapButton";
import { BrainstormCta } from "./BrainstormCta";
import { deriveSetup, setupSignature } from "./setup-model";
import { Download } from "nai:icons/feather";

function iconButtonStyle(disabled: boolean): Record<string, string | number> {
  return {
    display: "inline-flex",
    alignItems: "center",
    background: "none",
    border: "none",
    cursor: disabled ? "default" : "pointer",
    color: T.text,
    padding: "2px",
    opacity: disabled ? 0.4 : 1,
  };
}

export function Setup(props: {
  hasDocumentContent: boolean;
  onOpenChat: () => void;
}) {
  // Subscribing to the signature — a primitive covering exactly the fields
  // deriveSetup reads — is what repaints the action row on a store change.
  useSlice(setupSignature);

  const editId = useSlice((s) => s.ui.activeEditId);
  const importOpen = useSlice((s) => s.ui.importWizardOpen);
  // Owned by App, which never unmounts — this panel does, on every tab switch.
  const hasDocumentContent = props.hasDocumentContent;

  const field = editId
    ? FIELD_DESCRIPTORS.find((d) => d.id === editId)
    : undefined;

  if (field) {
    return <FoundationEditPane descriptor={field} />;
  }
  if (importOpen) {
    return (
      <ImportWizard onClose={() => store.dispatch(importWizardClosed())} />
    );
  }

  const model = deriveSetup(store.getState(), { hasDocumentContent });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SP.md }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: SP.sm,
        }}
      >
        <BootstrapButton
          hasDocumentContent={hasDocumentContent}
          text={model.bootstrap.text}
          disabled={model.bootstrap.disabled}
        />
        <button
          title="Import"
          disabled={model.importDisabled}
          onClick={() => store.dispatch(importWizardOpened())}
          style={iconButtonStyle(model.importDisabled)}
        >
          <Download size={16} />
        </button>
      </div>
      <Foundation />
      <BrainstormCta onOpenChat={props.onOpenChat} />
    </div>
  );
}
