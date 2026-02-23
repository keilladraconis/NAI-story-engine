/**
 * Shared save registry for the singleton editable pattern.
 *
 * At most one editor is active at a time. Before activating a new one,
 * call flushActiveEditor() to auto-save the previous one.
 */

let pendingSave: (() => Promise<void>) | null = null;

/** Force-save the currently active editor (if any). Call before activating a new one. */
export async function flushActiveEditor(): Promise<void> {
  if (pendingSave) {
    const save = pendingSave;
    pendingSave = null;
    await save();
  }
}

/** Register this editor's save callback as the active one. */
export function registerActiveEditor(save: () => Promise<void>): void {
  pendingSave = save;
}

/** Clear the active editor registration (called on explicit save). */
export function clearActiveEditor(): void {
  pendingSave = null;
}
