import { defineComponent } from "nai-act";
import { RootState } from "../../../core/store/types";
import { crucibleIntentRequested } from "../../../core/store/slices/crucible";
import { IDS } from "../../framework/ids";
import { GenerationButton } from "../GenerationButton";
import { EditableText } from "../EditableText";

const { text, row, column } = api.v1.ui.part;

const CR = IDS.CRUCIBLE;

/** Format intent prose for display: only apply emoji to [TAGS], rest is natural prose. */
function formatForDisplay(raw: string): string {
  const display = raw.replace(/\[TAGS\]/g, "\uD83C\uDFF7\uFE0F");
  return display.replace(/\n/g, "  \n").replace(/</g, "\\<");
}

export const IntentSection = defineComponent<undefined, RootState>({
  id: () => CR.INTENT_SECTION,

  styles: {
    headerRow: {
      "justify-content": "space-between",
      "align-items": "center",
      gap: "6px",
    },
    sectionTitle: {
      "font-size": "0.85em",
      "font-weight": "bold",
      opacity: "0.9",
    },
    divider: {
      "border-top": "1px solid rgba(255,255,255,0.08)",
      margin: "4px 0",
    },
  },

  build(_props, ctx) {
    const { useSelector } = ctx;

    const { part: intentBtnPart } = ctx.render(GenerationButton, {
      id: CR.INTENT_BTN,
      label: "",
      variant: "button",
      generateAction: crucibleIntentRequested(),
      stateProjection: (s: RootState) => ({
        activeType: s.runtime.activeRequest?.type,
        queueTypes: s.runtime.queue.map((q) => q.type),
      }),
      requestIdFromProjection: () => {
        const s = ctx.getState();
        if (s.runtime.activeRequest?.type === "crucibleIntent") return s.runtime.activeRequest.id;
        const queued = s.runtime.queue.find((q) => q.type === "crucibleIntent");
        return queued?.id;
      },
      isDisabledFromProjection: (proj: any) =>
        proj.activeType === "crucibleChain" || proj.activeType === "crucibleBuild" || proj.activeType === "crucibleGoal",
    });

    const { part: intentEditablePart } = ctx.render(EditableText, {
      id: CR.INTENT_TEXT,
      storageKey: "cr-intent",
      placeholder: "The story explores... [TAGS] tag1, tag2, tag3",
    });

    // Intent display — seed storyStorage for EditableText
    useSelector(
      (s) => s.crucible.intent,
      (intent) => {
        if (!intent) return;
        api.v1.storyStorage.set("cr-intent", intent);
        api.v1.ui.updateParts([
          { id: `${CR.INTENT_TEXT}-view`, text: formatForDisplay(intent) },
        ]);
      },
    );

    // Intent button visibility by phase
    useSelector(
      (s) => s.crucible.phase,
      (phase) => {
        const preChaining = phase === "idle" || phase === "goals";
        api.v1.ui.updateParts([
          {
            id: `${CR.INTENT_BTN}`,
            style: preChaining ? { display: "flex" } : { display: "none" },
          },
        ]);
      },
    );

    return column({
      id: CR.INTENT_SECTION,
      style: { gap: "4px" },
      content: [
        row({ style: this.style?.("divider"), content: [] }),
        row({
          style: { ...this.style?.("headerRow"), gap: "6px" },
          content: [
            text({ text: "**Intent**", style: this.style?.("sectionTitle"), markdown: true }),
            intentBtnPart,
          ],
        }),
        intentEditablePart,
      ],
    });
  },
});
