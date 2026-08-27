// Setup tab body — where a story starts.
//
// Owns the Foundation fields, the opening-scene card, and the Import wizard.
// Like the Engine tab it routes panes by membership over the shared
// ui.activeEditId singleton, but it only claims Foundation field ids; entity and
// thread ids belong to Engine.tsx. The wizard yields to an open edit pane,
// matching the priority order Engine.tsx uses.
//
// The tab is a staged nudge, and every rule about what is showing lives in
// deriveSetup rather than here: talk it through, then fill the Foundation, then
// write the opening scene. This file renders that decision; it does not make it.

import { useSlice } from "../../bridge";
import {
  store,
  importWizardOpened,
  importWizardClosed,
  foundationExpansionSet,
} from "../../../core/store";
import { SP, T } from "../../style";
import { Foundation } from "../foundation/Foundation";
import { FoundationEditPane } from "../foundation/FoundationEditPane";
import { IntensityPicker } from "../foundation/IntensityPicker";
import { FIELD_DESCRIPTORS } from "../foundation/fields";
import { ImportWizard } from "../import/ImportWizard";
import { BootstrapButton } from "./BootstrapButton";
import { BrainstormCta } from "./BrainstormCta";
import { SectionHeader } from "../../components/SectionHeader";
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
  // deriveSetup reads — is what repaints the tab on a store change.
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
      <button
        onClick={() =>
          model.importDisabled || store.dispatch(importWizardOpened())
        }
        style={importButtonStyle(model.importDisabled)}
      >
        <Download size={16} />
        Import Wizard
      </button>

      <IntensityPicker />

      {/* Every stage below is mounted in both states and toggled by `display`.
          These re-renders come from store subscriptions, not JSX event
          handlers, and a conditional that swaps an element for null in a
          detached render can leave the old one in the DOM. */}
      <div style={{ display: model.showBrainstormCta ? "block" : "none" }}>
        <BrainstormCta onOpenChat={props.onOpenChat} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: SP.md }}>
        <SectionHeader
          label="Foundation"
          open={model.foundationOpen}
          onToggle={() =>
            store.dispatch(
              foundationExpansionSet({ expanded: !model.foundationOpen }),
            )
          }
        />
        <div style={{ display: model.foundationOpen ? "block" : "none" }}>
          <Foundation />
        </div>
      </div>

      <div style={{ display: model.showBootstrap ? "block" : "none" }}>
        <BootstrapButton disabled={model.bootstrapDisabled} />
      </div>
    </div>
  );
}
