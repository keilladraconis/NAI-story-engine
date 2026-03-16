import { defineComponent } from "nai-act";
import { RootState } from "../../../core/store/types";
import { IDS } from "../../framework/ids";
import { CrucibleHeader } from "./CrucibleHeader";
import { ShapeSection } from "./ShapeSection";
import { IntentSection } from "./IntentSection";
import { TensionsSection } from "./TensionsSection";
import { BuildPassView } from "./BuildPassView";

const { column, row, text, textInput } = api.v1.ui.part;

const CR = IDS.CRUCIBLE;

export const CruciblePanel = defineComponent<undefined, RootState>({
  id: () => CR.WINDOW_ROOT,

  styles: {
    hidden: { display: "none" },
    visible: { display: "flex" },
  },

  build(_props, ctx) {
    const { part: headerPart } = ctx.render(CrucibleHeader, undefined);
    const { part: shapePart } = ctx.render(ShapeSection, undefined);
    const { part: intentPart } = ctx.render(IntentSection, undefined);
    const { part: tensionsPart } = ctx.render(TensionsSection, undefined);
    const { part: buildPart } = ctx.render(BuildPassView, undefined);

    return column({
      id: CR.WINDOW_ROOT,
      style: { height: "100%", overflow: "hidden" },
      content: [
        headerPart,
        column({
          id: "cr-body",
          style: { flex: "1", overflow: "auto", gap: "8px", padding: "0 10px 10px", "justify-content": "flex-start" },
          content: [
            row({
              id: "cr-setting-row",
              style: { "align-items": "center", gap: "8px" },
              content: [
                text({ text: "Setting:", style: { "font-weight": "bold", opacity: 0.8, "white-space": "nowrap" } }),
                textInput({
                  id: "cr-setting-input",
                  initialValue: "Original",
                  placeholder: "Original, Star Wars...",
                  storageKey: "story:kse-setting",
                  style: { flex: 1 },
                }),
              ],
            }),
            column({ id: "cr-shape-wrap", style: {}, content: [shapePart] }),
            column({ id: "cr-intent-wrap", style: {}, content: [intentPart] }),
            column({ id: "cr-tensions-wrap", style: {}, content: [tensionsPart] }),
            column({
              id: "cr-build-wrap",
              content: [buildPart],
              ...ctx.bindPart(
                "cr-build-wrap",
                (s) => s.crucible.phase === "building",
                (showBuild) => ({ style: showBuild ? {} : this.style?.("hidden") }),
              ),
            }),
          ],
        }),
      ],
    });
  },
});
