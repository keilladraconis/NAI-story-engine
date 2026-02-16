import { defineComponent } from "nai-act";
import { RootState } from "../../../core/store/types";
import { crucibleIntentRequested } from "../../../core/store/slices/crucible";
import { IDS } from "../../framework/ids";
import { GenerationButton } from "../GenerationButton";
import { EditableText } from "../EditableText";

const { collapsibleSection } = api.v1.ui.part;

const CR = IDS.CRUCIBLE;

/** Format intent prose for display: only apply emoji to [TAGS], rest is natural prose. */
function formatForDisplay(raw: string): string {
  const display = raw.replace(/\[TAGS\]/g, "\uD83C\uDFF7\uFE0F");
  return display.replace(/\n/g, "  \n").replace(/</g, "\\<");
}

export const IntentSection = defineComponent<undefined, RootState>({
  id: () => CR.INTENT_SECTION,

  build(_props, ctx) {
    const { useSelector } = ctx;
    const state = ctx.getState();

    // Start expanded when there's no content yet, collapsed otherwise
    if (state.crucible.goals.length === 0 && !state.crucible.intent) {
      api.v1.storyStorage.set("cr-intent-collapsed", "");
    }

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
      label: "",
      extraControls: [intentBtnPart],
    });

    // Intent display — seed storyStorage for EditableText
    useSelector(
      (s) => s.crucible.intent,
      (intent) => {
        api.v1.storyStorage.set("cr-intent", intent ?? "");
        api.v1.ui.updateParts([
          { id: `${CR.INTENT_TEXT}-view`, text: intent ? formatForDisplay(intent) : "" },
        ]);
      },
    );

    // Intent button visibility + auto-collapse when auto-chaining or goals appear
    useSelector(
      (s) => ({
        autoChaining: s.crucible.autoChaining,
        hasGoals: s.crucible.goals.length > 0,
      }),
      (slice) => {
        api.v1.ui.updateParts([
          {
            id: `${CR.INTENT_BTN}`,
            style: !slice.autoChaining ? { display: "flex" } : { display: "none" },
          },
        ]);
        if (slice.autoChaining || slice.hasGoals) {
          api.v1.storyStorage.set("cr-intent-collapsed", "true");
        }
      },
    );

    return collapsibleSection({
      id: CR.INTENT_SECTION,
      title: "Direction",
      storageKey: "story:cr-intent-collapsed",
      style: { overflow: "visible" },
      content: [intentEditablePart],
    });
  },
});
