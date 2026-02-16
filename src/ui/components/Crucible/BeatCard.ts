import { defineComponent } from "nai-act";
import { RootState } from "../../../core/store/types";
import {
  beatEdited,
  beatFavorited,
  beatForked,
  beatsDeletedFrom,
} from "../../../core/store/slices/crucible";
import { IDS } from "../../framework/ids";
import { EditableText } from "../EditableText";
import { NAI_HEADER, STATUS_GENERATING } from "../../colors";

const { column, button } = api.v1.ui.part;

const CR = IDS.CRUCIBLE;

export interface BeatCardProps {
  goalId: string;
  beatIndex: number;
}

const FAV_STYLE = {
  padding: "2px 6px",
  "font-size": "0.8em",
  color: NAI_HEADER,
  opacity: "1",
};

const FAV_STYLE_OFF = {
  padding: "2px 6px",
  "font-size": "0.8em",
  opacity: "0.5",
};

const BEAT_BTN_STYLE = {
  padding: "2px 6px",
  "font-size": "0.8em",
  opacity: "0.5",
};

export const BeatCard = defineComponent<BeatCardProps, RootState>({
  id: (props) => CR.beat(props.goalId, props.beatIndex).ROOT,

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
    const { goalId, beatIndex } = props;
    const ids = CR.beat(goalId, beatIndex);
    const state = ctx.getState();
    const beat = state.crucible.chains[goalId]?.beats[beatIndex];
    const isTainted = beat?.tainted ?? false;
    const isFav = beat?.favorited ?? false;

    const favBtn = button({
      id: ids.FAV_BTN,
      text: "",
      iconId: "star",
      style: isFav ? FAV_STYLE : FAV_STYLE_OFF,
      callback: () => dispatch(beatFavorited({ goalId, beatIndex })),
    });

    const forkBtn = button({
      id: ids.FORK_BTN,
      text: "",
      iconId: "share-2",
      style: BEAT_BTN_STYLE,
      callback: () => dispatch(beatForked({ goalId, beatIndex, newGoalId: api.v1.uuid() })),
    });

    const delBtn = button({
      id: ids.DEL_BTN,
      text: "",
      iconId: "trash-2",
      style: BEAT_BTN_STYLE,
      callback: () => dispatch(beatsDeletedFrom({ goalId, fromIndex: beatIndex })),
    });

    const label = `Beat ${beatIndex + 1}`;

    const { part: editable } = ctx.render(EditableText, {
      id: ids.TEXT,
      storageKey: `cr-beat-${goalId}-${beatIndex}`,
      placeholder: "[SCENE] ...\n[CONFLICT] ...",
      label,
      onSave: (content: string) => {
        const s = ctx.getState();
        const chain = s.crucible.chains[goalId];
        if (!chain) return;
        const existingBeat = chain.beats[beatIndex];
        if (!existingBeat) return;

        dispatch(beatEdited({
          goalId,
          beatIndex,
          beat: {
            text: content,
            constraintsResolved: existingBeat.constraintsResolved,
            newOpenConstraints: existingBeat.newOpenConstraints,
            groundStateConstraints: existingBeat.groundStateConstraints,
          },
        }));
      },
      extraControls: [favBtn, forkBtn, delBtn],
    });

    // Reactively update fav button style
    useSelector(
      (s) => s.crucible.chains[goalId]?.beats[beatIndex]?.favorited ?? false,
      (fav) => {
        api.v1.ui.updateParts([
          { id: ids.FAV_BTN, style: fav ? FAV_STYLE : FAV_STYLE_OFF },
        ]);
      },
    );

    // Reactively update tainted indicator (border color)
    useSelector(
      (s) => s.crucible.chains[goalId]?.beats[beatIndex]?.tainted ?? false,
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
