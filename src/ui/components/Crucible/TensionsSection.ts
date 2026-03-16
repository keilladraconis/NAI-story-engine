import { defineComponent } from "nai-act";
import { RootState } from "../../../core/store/types";
import {
  tensionsCleared,
  crucibleStopRequested,
  crucibleBuildPassRequested,
  crucibleTensionsRequested,
} from "../../../core/store/slices/crucible";
import { IDS } from "../../framework/ids";
import { ButtonWithConfirmation } from "../ButtonWithConfirmation";
import { GenerationButton } from "../GenerationButton";
import { TensionCard } from "./TensionCard";
import { NAI_WARNING } from "../../colors";

const { row, column, collapsibleSection } = api.v1.ui.part;

const CR = IDS.CRUCIBLE;

export const TensionsSection = defineComponent<undefined, RootState>({
  id: () => "cr-tensions-section",

  styles: {
    headerRow: {
      "justify-content": "space-between",
      "align-items": "center",
      gap: "6px",
    },
    tensionsList: {
      gap: "6px",
    },
    btn: {
      padding: "5px 10px",
      "font-size": "0.8em",
    },
    btnDanger: {
      padding: "5px 10px",
      "font-size": "0.8em",
      color: NAI_WARNING,
    },
    hidden: { display: "none" },
  },

  build(_props, ctx) {
    const { dispatch, useSelector } = ctx;
    const state = ctx.getState();
    const { tensions } = state.crucible;

    const { part: clearTensionsPart } = ctx.render(ButtonWithConfirmation, {
      id: "cr-clear-tensions-btn",
      label: "",
      iconId: "trash",
      confirmLabel: "Clear all tensions?",
      buttonStyle: this.style?.("btnDanger"),
      onConfirm: () => dispatch(tensionsCleared()),
    });

    // "Build World" button — dispatches first build pass
    const { part: buildWorldBtn } = ctx.render(GenerationButton, {
      id: "cr-build-world-btn",
      label: "Build World",
      variant: "button",
      stateProjection: (s: RootState) => ({
        activeType: s.runtime.activeRequest?.type,
        queueLen: s.runtime.queue.length,
        hasAccepted: s.crucible.tensions.some((t) => t.accepted),
        phase: s.crucible.phase,
      }),
      requestIdFromProjection: () => {
        const s = ctx.getState();
        if (s.runtime.activeRequest?.type === "crucibleBuildPass") {
          return s.runtime.activeRequest.id;
        }
        return s.runtime.queue.find((q) => q.type === "crucibleBuildPass")?.id;
      },
      isDisabledFromProjection: (proj: { hasAccepted: boolean }) => !proj.hasAccepted,
      onCancel: () => dispatch(crucibleStopRequested()),
      onGenerate: () => {
        dispatch(crucibleBuildPassRequested());
      },
    });

    const tensionsBtnProps = {
      variant: "button" as const,
      stateProjection: (s: RootState) => ({
        activeType: s.runtime.activeRequest?.type,
        queueTypes: s.runtime.queue.map((q) => q.type),
      }),
      requestIdFromProjection: () => {
        const s = ctx.getState();
        if (s.runtime.activeRequest?.type === "crucibleTension") return s.runtime.activeRequest.id;
        return s.runtime.queue.find((q) => q.type === "crucibleTension")?.id;
      },
      onGenerate: () => dispatch(crucibleTensionsRequested()),
      onCancel: () => dispatch(crucibleStopRequested()),
    };

    // "Generate Tensions" button — shown in empty state
    const { part: generateTensionsBtn } = ctx.render(GenerationButton, {
      id: "cr-generate-tensions-btn",
      label: "Generate Tensions",
      ...tensionsBtnProps,
    });

    // "Generate Tensions" button — shown in populated state
    const { part: moreTensionsBtn } = ctx.render(GenerationButton, {
      id: "cr-more-tensions-btn",
      label: "Generate Tensions",
      ...tensionsBtnProps,
    });

    const hasTensions = tensions.length > 0;

    // Reactive: toggle empty/populated controls visibility
    useSelector(
      (s) => s.crucible.tensions.length > 0,
      (hasTensionsNow) => {
        api.v1.ui.updateParts([
          { id: "cr-empty-row", style: hasTensionsNow ? this.style?.("hidden") : this.style?.("headerRow") },
          { id: "cr-tension-controls", style: hasTensionsNow ? this.style?.("headerRow") : this.style?.("hidden") },
          { id: CR.TENSIONS_LIST, style: hasTensionsNow ? this.style?.("tensionsList") : this.style?.("hidden") },
        ]);
      },
    );

    return column({
      id: "cr-tensions-section",
      style: { gap: "6px" },
      content: [
        collapsibleSection({
          id: "cr-tensions-collapsible",
          title: "Tensions",
          initialCollapsed: true,
          storageKey: "story:cr-tensions-collapsed",
          style: { overflow: "visible" },
          content: [
            // Empty state: just the "Generate Tensions" button
            row({
              id: "cr-empty-row",
              style: hasTensions ? this.style?.("hidden") : this.style?.("headerRow"),
              content: [generateTensionsBtn],
            }),
            // Populated state: generate more, clear
            row({
              id: "cr-tension-controls",
              style: hasTensions ? this.style?.("headerRow") : this.style?.("hidden"),
              content: [
                moreTensionsBtn,
                clearTensionsPart,
              ],
            }),
            column({
              id: CR.TENSIONS_LIST,
              style: hasTensions ? this.style?.("tensionsList") : this.style?.("hidden"),
              content: ctx.bindList(
                CR.TENSIONS_LIST,
                (s) => s.crucible.tensions,
                (t) => t.id,
                (t) => ({ component: TensionCard, props: { tensionId: t.id } }),
              ),
            }),
          ],
        }),
        buildWorldBtn,
      ],
    });
  },
});
