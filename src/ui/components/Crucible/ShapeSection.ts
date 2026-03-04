import { defineComponent } from "nai-act";
import { RootState } from "../../../core/store/types";
import {
  crucibleShapeRequested,
  crucibleStopRequested,
  updateShape,
} from "../../../core/store/slices/crucible";
import { IDS } from "../../framework/ids";
import { GenerationButton } from "../GenerationButton";
import { EditableText } from "../EditableText";

const { collapsibleSection, textInput } = api.v1.ui.part;

const CR = IDS.CRUCIBLE;


export const ShapeSection = defineComponent<undefined, RootState>({
  id: () => CR.SHAPE_SECTION,

  build(_props, ctx) {
    const { dispatch, useSelector } = ctx;
    const state = ctx.getState();

    const nameInputPart = textInput({
      id: CR.SHAPE_NAME,
      storageKey: "story:cr-shape-name",
      label: "",
      placeholder: "e.g. Slice of Life, Hero's Journey...",
    });

    const { part: shapeBtnPart } = ctx.render(GenerationButton, {
      id: CR.SHAPE_BTN,
      label: "",
      variant: "button",
      generateAction: crucibleShapeRequested(),
      stateProjection: (s: RootState) => ({
        activeType: s.runtime.activeRequest?.type,
        queueTypes: s.runtime.queue.map((q) => q.type),
      }),
      requestIdFromProjection: () => {
        const s = ctx.getState();
        if (s.runtime.activeRequest?.type === "crucibleShape") return s.runtime.activeRequest.id;
        return s.runtime.queue.find((q) => q.type === "crucibleShape")?.id;
      },
      onCancel: () => dispatch(crucibleStopRequested()),
    });

    const { part: shapeEditablePart } = ctx.render(EditableText, {
      id: CR.SHAPE_TEXT,
      getContent: () => ctx.getState().crucible.shape?.instruction ?? "",
      placeholder: "Generate or type the shape instruction...\n\nWhat structural moments this shape leans toward.",
      label: "",
      extraControls: [shapeBtnPart],
      initialDisplay: state.crucible.shape?.instruction,
      onSave: (content: string) => {
        dispatch(updateShape({
          name: ctx.getState().crucible.shape?.name ?? "Story",
          instruction: content,
        }));
      },
    });

    // Update display when shape changes (e.g. after generation completes)
    useSelector(
      (s) => s.crucible.shape?.name + "||" + s.crucible.shape?.instruction,
      () => {
        const shape = ctx.getState().crucible.shape;
        const name = shape?.name ?? "";
        // Keep Name input in sync with state (fires after generation)
        api.v1.storyStorage.set("cr-shape-name", name);
        api.v1.ui.updateParts([
          { id: `${CR.SHAPE_TEXT}-view`, text: shape?.instruction ?? "" },
          { id: CR.SHAPE_NAME, value: name },
        ]);
      },
    );

    return collapsibleSection({
      id: CR.SHAPE_SECTION,
      title: "Story Shape",
      initialCollapsed: false,
      storageKey: "story:cr-shape-collapsed",
      style: { overflow: "visible" },
      content: [nameInputPart, shapeEditablePart],
    });
  },
});
