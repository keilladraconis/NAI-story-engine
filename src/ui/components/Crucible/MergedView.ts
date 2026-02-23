import { defineComponent } from "nai-act";
import { RootState, CrucibleWorldElement } from "../../../core/store/types";
import { IDS } from "../../framework/ids";
import { FieldID, DulfsFieldID } from "../../../config/field-definitions";
import {
  crucibleReset,
  expansionStarted,
} from "../../../core/store/slices/crucible";
import { ButtonWithConfirmation } from "../ButtonWithConfirmation";

const { text, row, column, button } = api.v1.ui.part;

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
              button({
                text: "Expand",
                style: this.style?.("expandBtn"),
                callback: () => dispatch(expansionStarted({ elementId: el.id })),
              }),
            ],
          }));
        }
      }

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
