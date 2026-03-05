import { BindContext, defineComponent } from "nai-act";
import { RootState } from "../../core/store/types";
import {
  formatJournal,
  formatDigest,
  clearJournal,
  getJournalCount,
} from "../../core/generation-journal";

const { column, text, button, row } = api.v1.ui.part;

export const JournalPanel = defineComponent({
  id: () => "kse-journal-root",

  styles: {
    root: { padding: "8px", gap: "8px" },
    row: { gap: "8px", "align-items": "center" },
    countText: { "font-size": "0.85em", opacity: "0.8", flex: "1" },
    btn: { padding: "4px 8px", "font-size": "0.8em" },
  },

  build(_props: undefined, ctx: BindContext<RootState>) {
    const { useSelector } = ctx;

    const countId = "kse-journal-count";

    const copyJournal = async () => {
      const md = formatJournal();
      await api.v1.clipboard.writeText(md);
      api.v1.ui.toast("Journal copied to clipboard", { type: "success" });
    };

    const copyDigest = async () => {
      const md = formatDigest();
      await api.v1.clipboard.writeText(md);
      api.v1.ui.toast("SEGA digest copied to clipboard", { type: "success" });
    };

    const clearAndUpdate = async () => {
      await clearJournal();
      api.v1.ui.updateParts([
        { id: countId, text: "0 entries recorded" },
      ]);
    };

    // Update count whenever a generation completes (runtime.activeRequest changes)
    useSelector(
      (state) => state.runtime.activeRequest,
      () => {
        const count = getJournalCount();
        api.v1.ui.updateParts([
          { id: countId, text: `${count} entries recorded` },
        ]);
      },
    );

    const initialCount = getJournalCount();

    return column({
      id: "kse-journal-root",
      style: this.style?.("root"),
      content: [
        row({
          style: this.style?.("row"),
          content: [
            text({
              id: countId,
              text: `${initialCount} entries recorded`,
              style: this.style?.("countText"),
            }),
            button({
              id: "kse-journal-copy-btn",
              text: "Full",
              iconId: "clipboard",
              style: this.style?.("btn"),
              callback: copyJournal,
            }),
            button({
              id: "kse-journal-digest-btn",
              text: "SEGA Digest",
              iconId: "clipboard",
              style: this.style?.("btn"),
              callback: copyDigest,
            }),
            button({
              id: "kse-journal-clear-btn",
              text: "Clear",
              iconId: "trash-2",
              style: this.style?.("btn"),
              callback: clearAndUpdate,
            }),
          ],
        }),
      ],
    });
  },
});
