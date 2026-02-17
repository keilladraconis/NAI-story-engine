import { defineComponent } from "nai-act";
import { RootState } from "../../../core/store/types";
import { crucibleDirectionRequested } from "../../../core/store/slices/crucible";
import { IDS } from "../../framework/ids";
import { GenerationButton } from "../GenerationButton";
import { EditableText } from "../EditableText";

const { collapsibleSection } = api.v1.ui.part;

const CR = IDS.CRUCIBLE;

/** Format direction prose for display: only apply emoji to [TAGS], rest is natural prose. */
function formatForDisplay(raw: string): string {
  const display = raw.replace(/\[TAGS\]/g, "\uD83C\uDFF7\uFE0F");
  return display.replace(/\n/g, "  \n").replace(/</g, "\\<");
}

export const IntentSection = defineComponent<undefined, RootState>({
  id: () => CR.DIRECTION_SECTION,

  build(_props, ctx) {
    const { useSelector } = ctx;
    const state = ctx.getState();

    // Start expanded when there's no content yet, collapsed otherwise
    if (state.crucible.goals.length === 0 && !state.crucible.direction) {
      api.v1.storyStorage.set("cr-direction-collapsed", "");
    }

    const { part: directionBtnPart } = ctx.render(GenerationButton, {
      id: CR.DIRECTION_BTN,
      label: "",
      variant: "button",
      generateAction: crucibleDirectionRequested(),
      stateProjection: (s: RootState) => ({
        activeType: s.runtime.activeRequest?.type,
        queueTypes: s.runtime.queue.map((q) => q.type),
      }),
      requestIdFromProjection: () => {
        const s = ctx.getState();
        if (s.runtime.activeRequest?.type === "crucibleDirection") return s.runtime.activeRequest.id;
        const queued = s.runtime.queue.find((q) => q.type === "crucibleDirection");
        return queued?.id;
      },
      isDisabledFromProjection: (proj: any) =>
        proj.activeType === "crucibleChain" || proj.activeType === "crucibleBuild" || proj.activeType === "crucibleGoal",
    });

    const { part: directionEditablePart } = ctx.render(EditableText, {
      id: CR.DIRECTION_TEXT,
      storageKey: "cr-direction",
      placeholder: "The story explores... [TAGS] tag1, tag2, tag3",
      label: "",
      extraControls: [directionBtnPart],
      initialDisplay: state.crucible.direction ? formatForDisplay(state.crucible.direction) : undefined,
    });

    // Direction display — seed storyStorage for EditableText
    useSelector(
      (s) => s.crucible.direction,
      (direction) => {
        api.v1.storyStorage.set("cr-direction", direction ?? "");
        api.v1.ui.updateParts([
          { id: `${CR.DIRECTION_TEXT}-view`, text: direction ? formatForDisplay(direction) : "" },
        ]);
      },
    );

    // Direction button visibility + auto-collapse when auto-chaining or goals appear
    useSelector(
      (s) => ({
        autoChaining: s.crucible.autoChaining,
        hasGoals: s.crucible.goals.length > 0,
      }),
      (slice) => {
        api.v1.ui.updateParts([
          {
            id: `${CR.DIRECTION_BTN}`,
            style: !slice.autoChaining ? { display: "flex" } : { display: "none" },
          },
        ]);
        if (slice.autoChaining || slice.hasGoals) {
          api.v1.storyStorage.set("cr-direction-collapsed", "true");
        }
      },
    );

    return collapsibleSection({
      id: CR.DIRECTION_SECTION,
      title: "Direction",
      storageKey: "story:cr-direction-collapsed",
      style: { overflow: "visible" },
      content: [directionEditablePart],
    });
  },
});
