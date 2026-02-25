import { defineComponent } from "nai-act";
import { RootState } from "../../../core/store/types";
import { crucibleDirectionRequested, crucibleDirectionEdited } from "../../../core/store/slices/crucible";
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
    const { useSelector, dispatch } = ctx;
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
        proj.activeType === "crucibleShapeDetection" || proj.activeType === "crucibleGoal" ||
        proj.activeType === "cruciblePrereqs" || proj.activeType === "crucibleElements",
    });

    const { part: directionEditablePart } = ctx.render(EditableText, {
      id: CR.DIRECTION_TEXT,
      getContent: () => ctx.getState().crucible.direction ?? "",
      placeholder: "The story explores... [TAGS] tag1, tag2, tag3",
      label: "",
      extraControls: [directionBtnPart],
      initialDisplay: state.crucible.direction ? formatForDisplay(state.crucible.direction) : undefined,
      onSave: (content: string) => dispatch(crucibleDirectionEdited({ text: content })),
    });

    // Direction display — update view text when state changes (e.g. from generation)
    useSelector(
      (s) => s.crucible.direction,
      (direction) => {
        api.v1.ui.updateParts([
          { id: `${CR.DIRECTION_TEXT}-view`, text: direction ? formatForDisplay(direction) : "" },
        ]);
      },
    );

    // Auto-collapse when building phase starts or goals appear
    useSelector(
      (s) => ({
        phase: s.crucible.phase,
        hasGoals: s.crucible.goals.length > 0,
      }),
      (slice) => {
        api.v1.ui.updateParts([
          {
            id: `${CR.DIRECTION_BTN}`,
            style: slice.phase === "direction" || slice.phase === "goals" ? { display: "flex" } : { display: "none" },
          },
        ]);
        if (slice.phase === "building" || slice.hasGoals) {
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
