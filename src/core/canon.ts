// Adding and removing canon documents.

import {
  store,
  docAdded,
  docRemoved,
  docOpened,
  targetSet,
  type DocKind,
} from "./store";
import { KINDS } from "./workshop/targets";
import { draftText } from "./workshop/page";

/** Add a document and open it. Kinds other than dossier and system are titled by kind. */
export function addDoc(kind: DocKind, name = ""): string {
  const id = api.v1.uuid();
  const title =
    kind === "dossier" || kind === "system"
      ? name.trim() || (kind === "dossier" ? "Unnamed" : "Unnamed system")
      : KINDS[kind].heading;
  store.dispatch(docAdded({ id, kind, title, text: "" }));
  store.dispatch(docOpened({ id }));
  return id;
}

/** Remove a document. Refused while it is being drafted on the page. */
export async function deleteDoc(id: string): Promise<void> {
  const { workshop } = store.getState();
  const drafting =
    workshop.target.kind === "doc" && workshop.target.docId === id;
  if (drafting) {
    if (workshop.on && (await draftText())) {
      void api.v1.ui.toast("Save or clear its draft on the page first.", {
        type: "info",
      });
      return;
    }
    store.dispatch(targetSet({ kind: "vignette" }));
  }
  store.dispatch(docRemoved({ id }));
  if (store.getState().ui.openDocId === id)
    store.dispatch(docOpened({ id: null }));
}
