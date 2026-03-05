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

    // --- Per-tension card cache ---
    const tensionCardCache = new Map<string, { part: UIPart; unmount: () => void }>();

    const ensureTensionCard = (tensionId: string): UIPart => {
      const existing = tensionCardCache.get(tensionId);
      if (existing) return existing.part;
      const result = ctx.render(TensionCard, { tensionId });
      tensionCardCache.set(tensionId, result);
      return result.part;
    };

    const hasTensions = tensions.length > 0;
    const initialTensionCards = tensions.map((t) => ensureTensionCard(t.id));

    // --- Reactive: rebuild tension list ---
    const rebuildTensionsList = (): void => {
      const st = ctx.getState();
      const currentTensions = st.crucible.tensions;
      const nowEmpty = currentTensions.length === 0;

      // Swap controls visibility
      api.v1.ui.updateParts([
        { id: "cr-empty-row", style: nowEmpty ? this.style?.("headerRow") : this.style?.("hidden") },
        { id: "cr-tension-controls", style: nowEmpty ? this.style?.("hidden") : this.style?.("headerRow") },
      ]);

      if (nowEmpty) {
        for (const { unmount } of tensionCardCache.values()) unmount();
        tensionCardCache.clear();
        api.v1.ui.updateParts([{ id: CR.TENSIONS_LIST, style: this.style?.("hidden") }]);
        return;
      }

      // Unmount all cached cards so they re-render with fresh state from getState()
      for (const { unmount } of tensionCardCache.values()) unmount();
      tensionCardCache.clear();

      api.v1.ui.updateParts([{
        id: CR.TENSIONS_LIST,
        style: this.style?.("tensionsList"),
        content: currentTensions.map((t) => ensureTensionCard(t.id)),
      }]);
    };

    useSelector(
      (s) => s.crucible.tensions.map((t) => t.id).join(","),
      () => rebuildTensionsList(),
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
              content: initialTensionCards,
            }),
          ],
        }),
        buildWorldBtn,
      ],
    });
  },
});
