/**
 * SeJournalPanel — SUI replacement for JournalPanel (nai-act).
 *
 * Displays journal entry count + three action buttons.
 * Count updates reactively via StoreWatcher on activeRequest changes.
 */

import { SuiComponent, type SuiComponentOptions } from "nai-simple-ui";
import {
  formatJournal,
  formatDigest,
  clearJournal,
  getJournalCount,
} from "../../core/generation-journal";
import { StoreWatcher } from "../store-watcher";

type SeJournalPanelTheme = { default: { self: { style: object } } };
type SeJournalPanelState = Record<string, never>;

export type SeJournalPanelOptions = SuiComponentOptions<
  SeJournalPanelTheme,
  SeJournalPanelState
>;

const COUNT_ID = "kse-journal-count";

const S = {
  root: { padding: "8px", gap: "8px" },
  row: { gap: "8px", "align-items": "center" },
  count: { "font-size": "0.85em", opacity: "0.8", flex: "1" },
  btn: { padding: "4px 8px", "font-size": "0.8em" },
};

export class SeJournalPanel extends SuiComponent<
  SeJournalPanelTheme,
  SeJournalPanelState,
  SeJournalPanelOptions,
  UIPartColumn
> {
  private readonly _watcher: StoreWatcher;

  constructor(options: SeJournalPanelOptions) {
    super(
      { state: {} as SeJournalPanelState, ...options },
      { default: { self: { style: {} } } },
    );
    this._watcher = new StoreWatcher();
  }

  async compose(): Promise<UIPartColumn> {
    this._watcher.dispose();

    this._watcher.watch(
      (s) => s.runtime.activeRequest,
      () => {
        api.v1.ui.updateParts([
          { id: COUNT_ID, text: `${getJournalCount()} entries recorded` },
        ]);
      },
    );

    const { column, row, text, button } = api.v1.ui.part;

    return column({
      id: "kse-journal-root",
      style: S.root,
      content: [
        row({
          style: S.row,
          content: [
            text({
              id: COUNT_ID,
              text: `${getJournalCount()} entries recorded`,
              style: S.count,
            }),
            button({
              id: "kse-journal-copy-btn",
              text: "Full",
              iconId: "clipboard" as IconId,
              style: S.btn,
              callback: async () => {
                await api.v1.clipboard.writeText(formatJournal());
                api.v1.ui.toast("Journal copied to clipboard", {
                  type: "success",
                });
              },
            }),
            button({
              id: "kse-journal-digest-btn",
              text: "SEGA Digest",
              iconId: "clipboard" as IconId,
              style: S.btn,
              callback: async () => {
                await api.v1.clipboard.writeText(formatDigest());
                api.v1.ui.toast("SEGA digest copied to clipboard", {
                  type: "success",
                });
              },
            }),
            button({
              id: "kse-journal-clear-btn",
              text: "Clear",
              iconId: "trash-2" as IconId,
              style: S.btn,
              callback: async () => {
                await clearJournal();
                api.v1.ui.updateParts([
                  { id: COUNT_ID, text: "0 entries recorded" },
                ]);
              },
            }),
          ],
        }),
      ],
    });
  }
}
