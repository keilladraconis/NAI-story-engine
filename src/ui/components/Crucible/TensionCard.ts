import { defineComponent } from "nai-act";
import { RootState } from "../../../core/store/types";
import {
  tensionRemoved,
  tensionAcceptanceToggled,
  tensionTextUpdated,
} from "../../../core/store/slices/crucible";
import { IDS } from "../../framework/ids";
import { EditableText } from "../EditableText";
import { escapeForMarkdown } from "../../utils";
import { NAI_WARNING } from "../../colors";

const { column } = api.v1.ui.part;

const CR = IDS.CRUCIBLE;

export interface TensionCardProps {
  tensionId: string;
}

const ACCEPT_BTN_BASE = { padding: "2px 6px", "font-size": "0.8em" };
const COLOR_ACCEPTED = "rgb(100, 220, 120)";
const COLOR_REJECTED = NAI_WARNING;

function acceptBtnStyle(accepted: boolean) {
  return { ...ACCEPT_BTN_BASE, color: accepted ? COLOR_ACCEPTED : COLOR_REJECTED };
}

function delBtnStyle(accepted: boolean) {
  return { padding: "2px 6px", "font-size": "0.8em", display: accepted ? "none" : "" };
}

export const TensionCard = defineComponent<TensionCardProps, RootState>({
  id: (props) => CR.tension(props.tensionId).ROOT,

  styles: {
    card: {
      padding: "6px 8px",
      "border-radius": "4px",
      "background-color": "rgba(255,255,255,0.04)",
      "border-left": "3px solid rgba(245,243,194,0.5)",
      gap: "2px",
    },
  },

  build(props, ctx) {
    const { dispatch, useSelector } = ctx;
    const { tensionId } = props;
    const ids = CR.tension(tensionId);

    const acceptBtnId = `${ids.ROOT}-accept`;
    const tension = ctx.getState().crucible.tensions.find((t) => t.id === tensionId);
    const initialAccepted = tension?.accepted ?? true;

    // Reactively update view text when this tension's text changes.
    ctx.bindPart(
      `${ids.TEXT}-view`,
      (s) => s.crucible.tensions.find((t) => t.id === tensionId)?.text,
      (txt) => ({ text: escapeForMarkdown(txt ?? "_Generating..._") }),
    );

    const acceptBtn = api.v1.ui.part.button({
      id: acceptBtnId,
      iconId: initialAccepted ? "check" : "x",
      style: acceptBtnStyle(initialAccepted),
      callback: () => dispatch(tensionAcceptanceToggled({ tensionId })),
    });

    useSelector(
      (s) => s.crucible.tensions.find((t) => t.id === tensionId)?.accepted,
      (accepted) => {
        const a = accepted ?? true;
        api.v1.ui.updateParts([
          { id: acceptBtnId, iconId: a ? "check" : "x", style: acceptBtnStyle(a) },
          { id: ids.DEL_BTN, style: delBtnStyle(a) },
        ]);
      },
    );

    const delBtn = api.v1.ui.part.button({
      id: ids.DEL_BTN,
      iconId: "trash-2",
      style: delBtnStyle(initialAccepted),
      callback: () => dispatch(tensionRemoved({ tensionId })),
    });

    const initialText = tension?.text ?? "";
    const initialDisplay = initialText
      ? escapeForMarkdown(initialText)
      : "_Generating..._";

    const { part: editable } = ctx.render(EditableText, {
      id: ids.TEXT,
      initialDisplay,
      getContent: () => {
        const t = ctx.getState().crucible.tensions.find((t) => t.id === tensionId);
        return t?.text ?? "";
      },
      placeholder: "A narrative tension...",
      onSave: (content: string) =>
        dispatch(tensionTextUpdated({ tensionId, text: content })),
      extraControls: [acceptBtn, delBtn],
    });

    return column({
      id: ids.ROOT,
      style: this.style?.("card"),
      content: [editable],
    });
  },
});
