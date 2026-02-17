import { defineComponent } from "nai-act";
import { RootState } from "../../../core/store/types";
import {
  sceneEdited,
  scenesDeletedFrom,
} from "../../../core/store/slices/crucible";
import { IDS } from "../../framework/ids";
import { EditableText } from "../EditableText";
import { STATUS_GENERATING } from "../../colors";
import { formatTagsWithEmoji, stripSceneTag } from "../../../core/utils/tag-parser";
import { sceneNumber } from "../../../core/utils/crucible-strategy";

const { column, button } = api.v1.ui.part;

const CR = IDS.CRUCIBLE;

export interface SceneCardProps {
  goalId: string;
  sceneIndex: number;
}

const SCENE_BTN_STYLE = {
  opacity: "0.5",
};

export const SceneCard = defineComponent<SceneCardProps, RootState>({
  id: (props) => CR.scene(props.goalId, props.sceneIndex).ROOT,

  styles: {
    card: {
      padding: "6px 8px",
      "border-radius": "4px",
      "background-color": "rgba(255,255,255,0.03)",
      "border-left": "3px solid rgba(245,243,194,0.3)",
      gap: "2px",
    },
    tainted: {
      "border-left": `3px solid ${STATUS_GENERATING}`,
    },
  },

  build(props, ctx) {
    const { dispatch, useSelector } = ctx;
    const { goalId, sceneIndex } = props;
    const ids = CR.scene(goalId, sceneIndex);
    const state = ctx.getState();
    const scene = state.crucible.chains[goalId]?.scenes[sceneIndex];
    const isTainted = scene?.tainted ?? false;

    const delBtn = button({
      id: ids.DEL_BTN,
      text: "",
      iconId: "trash-2",
      style: SCENE_BTN_STYLE,
      callback: () => dispatch(scenesDeletedFrom({ goalId, fromIndex: sceneIndex })),
    });

    const label = `Scene ${sceneNumber(sceneIndex)}`;

    const formatDisplay = (content: string): string =>
      formatTagsWithEmoji(stripSceneTag(content));

    const sceneDisplay = scene?.text ? formatDisplay(scene.text) : undefined;

    const { part: editable } = ctx.render(EditableText, {
      id: ids.TEXT,
      storageKey: `cr-scene-${goalId}-${sceneIndex}`,
      placeholder: "[SCENE] ...\n[OPEN] ...\n[RESOLVED] ...",
      label,
      initialDisplay: sceneDisplay,
      formatDisplay,
      onSave: (content: string) => {
        const s = ctx.getState();
        const chain = s.crucible.chains[goalId];
        if (!chain) return;
        const existing = chain.scenes[sceneIndex];
        if (!existing) return;

        dispatch(sceneEdited({
          goalId,
          sceneIndex,
          scene: {
            text: content,
            constraintsResolved: existing.constraintsResolved,
            newOpenConstraints: existing.newOpenConstraints,
            groundStateConstraints: existing.groundStateConstraints,
          },
        }));
      },
      extraControls: [delBtn],
    });

    // Reactively update tainted indicator (border color)
    useSelector(
      (s) => s.crucible.chains[goalId]?.scenes[sceneIndex]?.tainted ?? false,
      (tainted) => {
        api.v1.ui.updateParts([
          { id: ids.ROOT, style: this.style?.("card", tainted && "tainted") },
        ]);
      },
    );

    return column({
      id: ids.ROOT,
      style: this.style?.("card", isTainted && "tainted"),
      content: [editable],
    });
  },
});
