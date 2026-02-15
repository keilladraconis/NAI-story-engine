import { defineComponent } from "nai-act";
import { RootState } from "../../../core/store/types";
import { IDS } from "../../framework/ids";
import { CrucibleHeader } from "./CrucibleHeader";
import { IntentSection } from "./IntentSection";
import { GoalsSection } from "./GoalsSection";
import { SolverView } from "./SolverView";
import { BuilderView } from "./BuilderView";

const { column } = api.v1.ui.part;

const CR = IDS.CRUCIBLE;

export const CruciblePanel = defineComponent<undefined, RootState>({
  id: () => CR.WINDOW_ROOT,

  build(_props, ctx) {
    const { part: headerPart } = ctx.render(CrucibleHeader, undefined);
    const { part: intentPart } = ctx.render(IntentSection, undefined);
    const { part: goalsPart } = ctx.render(GoalsSection, undefined);
    const { part: solverPart } = ctx.render(SolverView, undefined);
    const { part: builderPart } = ctx.render(BuilderView, undefined);

    return column({
      id: CR.WINDOW_ROOT,
      style: { height: "100%", overflow: "hidden" },
      content: [
        headerPart,
        column({
          id: CR.SOLVER_BODY,
          style: { flex: "1", overflow: "auto", gap: "8px", padding: "0 10px 10px" },
          content: [intentPart, goalsPart, solverPart, builderPart],
        }),
      ],
    });
  },
});
