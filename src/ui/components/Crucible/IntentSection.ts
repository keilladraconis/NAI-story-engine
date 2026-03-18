import { defineComponent } from "nai-act";
import { RootState } from "../../../core/store/types";
import { crucibleDirectionRequested, crucibleDirectionEdited } from "../../../core/store/slices/crucible";
import { IDS, STORAGE_KEYS } from "../../framework/ids";
import { GenerationButton } from "../GenerationButton";
import { EditableText } from "../EditableText";
import { escapeForMarkdown, updateVisibility } from "../../utils";

const { collapsibleSection } = api.v1.ui.part;

const CR = IDS.CRUCIBLE;

export const IntentSection = defineComponent<undefined, RootState>({
  id: () => CR.DIRECTION_SECTION,

  build(_props, ctx) {
    const { useSelector, dispatch } = ctx;
    const state = ctx.getState();

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
    });

    const { part: directionEditablePart } = ctx.render(EditableText, {
      id: CR.DIRECTION_TEXT,
      getContent: () => ctx.getState().crucible.direction ?? "",
      placeholder: "The story explores... [TAGS] tag1, tag2, tag3",
      label: "",
      extraControls: [directionBtnPart],
      initialDisplay: state.crucible.direction ? escapeForMarkdown(state.crucible.direction) : undefined,
      onSave: (content: string) => dispatch(crucibleDirectionEdited({ text: content })),
    });

    // Direction display — update view text when state changes (e.g. from generation)
    ctx.bindPart(
      `${CR.DIRECTION_TEXT}-view`,
      (s) => s.crucible.direction,
      (direction) => ({ text: direction ? escapeForMarkdown(direction) : "" }),
    );

    // Hide generate button during building phase
    useSelector(
      (s) => s.crucible.phase,
      (phase) => {
        updateVisibility([[`${CR.DIRECTION_BTN}`, phase === "direction" || phase === "tensions"]]);
      },
    );

    return collapsibleSection({
      id: CR.DIRECTION_SECTION,
      title: "Direction",
      initialCollapsed: true,
      storageKey: STORAGE_KEYS.CR_DIRECTION_COLLAPSED_UI,
      style: { overflow: "visible" },
      content: [directionEditablePart],
    });
  },
});
