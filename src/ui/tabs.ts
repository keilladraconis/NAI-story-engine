// Tab identity for the Story Engine sidebar panel.
//
// Kept out of App.tsx so the ordering, the labels, and the two routing rules are
// testable headless — vitest runs in `environment: "node"` and collects only
// tests/**/*.test.ts, so nothing that lives in a .tsx file can be unit-tested.

import { FIELD_DESCRIPTORS } from "./panels/foundation/fields";

export type Tab = "setup" | "engine" | "chat";

/** Left-to-right order in the tab bar. Setup leads because it is where a story
 *  starts — it owns the Foundation, bootstrap, and Import. */
export const TAB_ORDER: readonly Tab[] = ["setup", "engine", "chat"];

export const TAB_LABELS: Readonly<Record<Tab, string>> = {
  setup: "Setup",
  engine: "Engine",
  chat: "Chat",
};

/** An empty document has nothing to show but Setup; a story already underway
 *  opens on the Engine. */
export function initialTab(hasDocumentContent: boolean): Tab {
  return hasDocumentContent ? "engine" : "setup";
}

/** Foundation fields are edited in Setup; entities and threads in Engine. */
export function isFoundationField(id: string | null): boolean {
  if (id === null) return false;
  return FIELD_DESCRIPTORS.some((d) => d.id === id);
}

/** Where to land when a refine chat closes: back where its edit pane lives.
 *  `ui.activeEditId` survives a refine commit — no effect clears it — so it is
 *  a reliable signal for which surface the writer came from. */
export function tabForActiveEdit(activeEditId: string | null): Tab {
  return isFoundationField(activeEditId) ? "setup" : "engine";
}
