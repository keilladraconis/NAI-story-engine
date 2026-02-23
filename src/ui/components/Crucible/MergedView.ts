import { defineComponent } from "nai-act";
import { RootState, CrucibleWorldElement } from "../../../core/store/types";
import { IDS } from "../../framework/ids";
import { FieldID, DulfsFieldID } from "../../../config/field-definitions";
import {
  crucibleReset,
  expansionTriggered,
} from "../../../core/store/slices/crucible";
import { ButtonWithConfirmation } from "../ButtonWithConfirmation";
import { GenerationButton } from "../GenerationButton";

const { text, row, column, multilineTextInput } = api.v1.ui.part;

const CR = IDS.CRUCIBLE;

/** Map DULFS field IDs to display labels. */
const FIELD_LABELS: Record<DulfsFieldID, string> = {
  [FieldID.DramatisPersonae]: "Characters",
  [FieldID.UniverseSystems]: "Systems",
  [FieldID.Locations]: "Locations",
  [FieldID.Factions]: "Factions",
  [FieldID.SituationalDynamics]: "Situations",
};

export const MergedView = defineComponent<undefined, RootState>({
  id: () => CR.MERGED_ROOT,

  styles: {
    hidden: { display: "none" },
    root: {
      gap: "8px",
    },
    sectionTitle: {
      "font-size": "0.75em",
      "font-weight": "bold",
      "text-transform": "uppercase",
      opacity: "0.6",
    },
    elementRow: {
      padding: "4px 8px",
      "border-radius": "3px",
      "background-color": "rgba(255,255,255,0.03)",
      gap: "6px",
      "align-items": "center",
    },
    elementName: {
      "font-size": "0.85em",
      flex: "1",
    },
    expandBtn: {
      padding: "2px 6px",
      "font-size": "0.75em",
      opacity: "0.6",
    },
    resetBtn: {
      padding: "5px 10px",
      "font-size": "0.8em",
      opacity: "0.7",
    },
    successText: {
      "font-size": "0.9em",
      opacity: "0.8",
      color: "#81c784",
    },
  },

  build(_props, ctx) {
    const { dispatch, useSelector } = ctx;

    const { part: resetBtn } = ctx.render(ButtonWithConfirmation, {
      id: "cr-start-over-btn",
      label: "Start Over",
      confirmLabel: "Reset Crucible?",
      buttonStyle: this.style?.("resetBtn"),
      onConfirm: () => dispatch(crucibleReset()),
    });

    // Expansion input + button (pre-rendered, stable)
    const expansionInput = multilineTextInput({
      id: "cr-merged-expand-prompt-input",
      placeholder: "What to explore? Leave blank to find what's missing.",
      storageKey: "story:cr-expand-prompt",
      style: { "font-size": "0.85em" },
    });
    const { part: expandGenBtn } = ctx.render(GenerationButton, {
      id: "cr-merged-expand-gen-btn",
      label: "Expand World",
      stateProjection: (s: RootState) => ({
        activeIsExpansion: s.runtime.activeRequest?.type === "crucibleExpansion",
        queueHasExpansion: s.runtime.queue.some((q) => q.type === "crucibleExpansion"),
      }),
      requestIdFromProjection: () => {
        const s = ctx.getState();
        if (s.runtime.activeRequest?.type === "crucibleExpansion") return s.runtime.activeRequest.id;
        return s.runtime.queue.find((q) => q.type === "crucibleExpansion")?.id;
      },
      onGenerate: () => dispatch(expansionTriggered({})),
    });

    // Cache for per-element expand buttons
    const expandBtnCache = new Map<string, UIPart>();
    const ensureExpandBtn = (el: CrucibleWorldElement): UIPart => {
      if (!expandBtnCache.has(el.id)) {
        const { part: expandBtn } = ctx.render(GenerationButton, {
          id: `cr-merged-expand-${el.id}`,
          label: "Expand",
          style: this.style?.("expandBtn"),
          stateProjection: (s: RootState) => ({
            activeIsExpansion: s.runtime.activeRequest?.type === "crucibleExpansion",
            queueHasExpansion: s.runtime.queue.some((q) => q.type === "crucibleExpansion"),
          }),
          requestIdFromProjection: () => {
            const s = ctx.getState();
            if (s.runtime.activeRequest?.type === "crucibleExpansion") return s.runtime.activeRequest.id;
            return s.runtime.queue.find((q) => q.type === "crucibleExpansion")?.id;
          },
          onGenerate: () => dispatch(expansionTriggered({ elementId: el.id })),
        });
        expandBtnCache.set(el.id, expandBtn);
      }
      return expandBtnCache.get(el.id)!;
    };

    // Build element inventory
    const buildInventory = (elements: CrucibleWorldElement[]): UIPart[] => {
      const groups = new Map<DulfsFieldID, CrucibleWorldElement[]>();
      for (const el of elements) {
        const list = groups.get(el.fieldId) || [];
        list.push(el);
        groups.set(el.fieldId, list);
      }

      const parts: UIPart[] = [
        text({
          text: `✓ ${elements.length} world elements merged to DULFS`,
          style: this.style?.("successText"),
          markdown: true,
        }),
      ];

      for (const [fieldId, fieldElements] of groups) {
        parts.push(text({ text: FIELD_LABELS[fieldId] || fieldId, style: this.style?.("sectionTitle") }));
        for (const el of fieldElements) {
          parts.push(row({
            style: this.style?.("elementRow"),
            content: [
              text({ text: el.name, style: this.style?.("elementName") }),
              ensureExpandBtn(el),
            ],
          }));
        }
      }

      parts.push(column({
        id: "cr-merged-expansion-section",
        style: { gap: "4px" },
        content: [
          text({ text: "Expand", style: this.style?.("sectionTitle") }),
          expansionInput,
          expandGenBtn,
        ],
      }));
      parts.push(resetBtn);
      return parts;
    };

    // Reactive rebuild
    useSelector(
      (s) => ({
        phase: s.crucible.phase,
        elementCount: s.crucible.elements.length,
      }),
      () => {
        const state = ctx.getState();
        if (state.crucible.phase !== "merged") return;

        const inventory = buildInventory(state.crucible.elements);
        api.v1.ui.updateParts([
          { id: CR.MERGED_ROOT, style: this.style?.("root"), content: inventory },
        ]);
      },
    );

    // Build initial state
    const state = ctx.getState();
    if (state.crucible.phase === "merged" && state.crucible.elements.length > 0) {
      const initialInventory = buildInventory(state.crucible.elements);
      return column({
        id: CR.MERGED_ROOT,
        style: this.style?.("root"),
        content: initialInventory,
      });
    }

    return column({
      id: CR.MERGED_ROOT,
      style: this.style?.("hidden"),
      content: [],
    });
  },
});
