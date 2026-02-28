import { defineComponent } from "nai-act";
import { RootState } from "../../../core/store/types";
import {
  crucibleShapeRequested,
  crucibleStopRequested,
  shapeDetected,
} from "../../../core/store/slices/crucible";
import { IDS } from "../../framework/ids";
import { GenerationButton } from "../GenerationButton";
import { EditableText } from "../EditableText";

const { collapsibleSection } = api.v1.ui.part;

const CR = IDS.CRUCIBLE;

const FALLBACK_INSTRUCTION = "Lean toward the moment that best captures the story's essential nature.";

/** Combine shape into editable text: name on first line, instruction below. */
function shapeToContent(shape: { name: string; instruction: string }): string {
  return `${shape.name}\n\n${shape.instruction}`;
}

/** Format combined shape text for markdown display. */
function shapeToDisplay(shape: { name: string; instruction: string }): string {
  return shapeToContent(shape).replace(/\n/g, "  \n").replace(/</g, "\\<");
}

/** Parse user-edited text back into name + instruction. */
function parseShapeContent(text: string): { name: string; instruction: string } {
  const trimmed = text.trim();
  const blankLine = trimmed.indexOf("\n\n");
  const name = (blankLine !== -1 ? trimmed.slice(0, blankLine) : trimmed.split("\n")[0]).trim();
  const instruction = (blankLine !== -1 ? trimmed.slice(blankLine) : "").trim();
  return {
    name: name || "Story",
    instruction: instruction || FALLBACK_INSTRUCTION,
  };
}

export const ShapeSection = defineComponent<undefined, RootState>({
  id: () => CR.SHAPE_SECTION,

  build(_props, ctx) {
    const { dispatch, useSelector } = ctx;
    const state = ctx.getState();

    // Start expanded when there's no shape yet
    if (!state.crucible.shape) {
      api.v1.storyStorage.set("cr-shape-collapsed", "");
    }

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
      getContent: () => {
        const shape = ctx.getState().crucible.shape;
        return shape ? shapeToContent(shape) : "";
      },
      placeholder: "Generate or type your story shape...\n\nLine 1: Shape Name (e.g. Intimate Moment)\nLine 3+: What structural moments this shape leans toward.",
      label: "",
      extraControls: [shapeBtnPart],
      initialDisplay: state.crucible.shape ? shapeToDisplay(state.crucible.shape) : undefined,
      onSave: (content: string) => {
        const { name, instruction } = parseShapeContent(content);
        dispatch(shapeDetected({ name, instruction }));
      },
    });

    // Update display when shape changes (e.g. after generation completes)
    useSelector(
      (s) => s.crucible.shape?.name + "||" + s.crucible.shape?.instruction,
      () => {
        const shape = ctx.getState().crucible.shape;
        api.v1.ui.updateParts([{
          id: `${CR.SHAPE_TEXT}-view`,
          text: shape ? shapeToDisplay(shape) : "",
        }]);
      },
    );

    return collapsibleSection({
      id: CR.SHAPE_SECTION,
      title: "Story Shape",
      storageKey: "story:cr-shape-collapsed",
      style: { overflow: "visible" },
      content: [shapeEditablePart],
    });
  },
});
