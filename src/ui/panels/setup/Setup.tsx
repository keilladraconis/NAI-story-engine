// Setup tab body — where a story starts.
//
// Owns the Foundation fields, the bootstrap button, and the Import wizard. Like
// the Engine tab it routes panes by membership over the shared ui.activeEditId
// singleton, but it only claims Foundation field ids; entity and thread ids
// belong to Engine.tsx. The wizard yields to an open edit pane, matching the
// priority order Engine.tsx uses.
//
// Layout runs in the order a story is actually built: bring existing material in
// (Import), choose a register (Intensity), talk it out if there is nothing yet
// (the CTA), fill the Foundation, then write the opening scene. The bootstrap
// button sits last because it is the step everything above it prepares for.

import { useSlice } from "../../bridge";
import {
  store,
  importWizardOpened,
  importWizardClosed,
} from "../../../core/store";
import { SP, T } from "../../style";
import { Foundation } from "../foundation/Foundation";
import { FoundationEditPane } from "../foundation/FoundationEditPane";
import { IntensityPicker } from "../foundation/IntensityPicker";
import { FIELD_DESCRIPTORS, foundationFieldsEmpty } from "../foundation/fields";
import { ImportWizard } from "../import/ImportWizard";
import { BootstrapButton } from "./BootstrapButton";
import { BrainstormCta } from "./BrainstormCta";
import { deriveSetup, setupSignature } from "./setup-model";
import { Download } from "nai:icons/feather";

function importButtonStyle(disabled: boolean): Record<string, string | number> {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: SP.sm,
    width: "100%",
    padding: SP.sm,
    background: "none",
    border: `1px solid ${T.bg3}`,
    cursor: disabled ? "default" : "pointer",
    color: T.text,
    fontFamily: T.fontDefault,
    fontSize: "0.85em",
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
  // The CTA appears and disappears as the Foundation fills, so this has to be a
  // subscription rather than a read off the snapshot below.
  const fieldsEmpty = useSlice(foundationFieldsEmpty);
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
      <button
        disabled={model.importDisabled}
        onClick={() => store.dispatch(importWizardOpened())}
        style={importButtonStyle(model.importDisabled)}
      >
        <Download size={16} />
        Import Wizard
      </button>
      <IntensityPicker />
      {/* Mounted in both states and toggled by `display`. This re-render comes
          from a store subscription, not a JSX event handler, and a conditional
          that swaps an element for null in a detached render can leave the old
          one in the DOM — the same hazard ConfirmButton and the header work
          around. */}
      <div style={{ display: fieldsEmpty ? "block" : "none" }}>
        <BrainstormCta onOpenChat={props.onOpenChat} />
      </div>
      <Foundation />
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <BootstrapButton
          hasDocumentContent={hasDocumentContent}
          text={model.bootstrap.text}
          disabled={model.bootstrap.disabled}
        />
      </div>
    </div>
  );
}
