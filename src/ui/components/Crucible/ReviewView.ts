import { defineComponent } from "nai-act";
import { RootState, CrucibleWorldElement, Prerequisite } from "../../../core/store/types";
import { IDS } from "../../framework/ids";
import { FieldID, DulfsFieldID } from "../../../config/field-definitions";
import {
  prerequisiteRemoved,
  elementRemoved,
  elementUpdated,
  crucibleMergeRequested,
  expansionTriggered,
} from "../../../core/store/slices/crucible";
import { GenerationButton } from "../GenerationButton";
import { EditableText } from "../EditableText";
import { ButtonWithConfirmation } from "../ButtonWithConfirmation";

const { text, row, column, collapsibleSection, button, multilineTextInput } = api.v1.ui.part;

const CR = IDS.CRUCIBLE;

/** Map DULFS field IDs to display labels. */
const FIELD_LABELS: Record<DulfsFieldID, string> = {
  [FieldID.DramatisPersonae]: "Characters",
  [FieldID.UniverseSystems]: "Systems",
  [FieldID.Locations]: "Locations",
  [FieldID.Factions]: "Factions",
  [FieldID.SituationalDynamics]: "Situations",
};

const FIELD_LABEL_SINGULAR: Record<DulfsFieldID, string> = {
  [FieldID.DramatisPersonae]: "Character",
  [FieldID.UniverseSystems]: "System",
  [FieldID.Locations]: "Location",
  [FieldID.Factions]: "Faction",
  [FieldID.SituationalDynamics]: "Situation",
};

/** Escape text for markdown view display. */
function escapeViewText(raw: string): string {
  return raw.replace(/\n/g, "  \n").replace(/</g, "\\<") || "_No content._";
}

/** Format element for display. */
function formatElementDisplay(el: CrucibleWorldElement): string {
  const parts: string[] = [];
  if (el.content) parts.push(el.content);
  if (el.want) parts.push(`**Want:** ${el.want}`);
  if (el.need) parts.push(`**Need:** ${el.need}`);
  if (el.relationship) parts.push(`**Relationship:** ${el.relationship}`);
  if (el.satisfies.length > 0) parts.push(`**Satisfies:** ${el.satisfies.join(", ")}`);
  return parts.join("\n") || "_No content._";
}

/** Format element for editing. */
function formatElementText(el: CrucibleWorldElement): string {
  return el.content ? `${el.name}: ${el.content}` : el.name;
}

/** Parse "Name: content" back into name and content parts. */
function parseElementText(raw: string): { name: string; content: string } {
  const colonIdx = raw.indexOf(":");
  if (colonIdx === -1) return { name: raw.trim(), content: "" };
  return {
    name: raw.slice(0, colonIdx).trim(),
    content: raw.slice(colonIdx + 1).trim(),
  };
}

export const ReviewView = defineComponent<undefined, RootState>({
  id: () => CR.REVIEW_ROOT,

  styles: {
    hidden: { display: "none" },
    root: {
      gap: "8px",
    },
    mergedText: {
      "font-size": "0.85em",
      color: "#81c784",
      "margin-top": "4px",
    },
    sectionTitle: {
      "font-size": "0.75em",
      "font-weight": "bold",
      "text-transform": "uppercase",
      opacity: "0.6",
    },
    prereqCard: {
      padding: "4px 8px",
      "border-radius": "3px",
      "background-color": "rgba(255,255,255,0.03)",
      "border-left": "2px solid rgba(255,183,77,0.4)",
      gap: "2px",
    },
    elementCard: {
      padding: "4px 8px",
      "border-radius": "3px",
      "background-color": "rgba(255,255,255,0.03)",
      "border-left": "2px solid rgba(129,212,250,0.4)",
      gap: "2px",
    },
    deleteBtn: {
      opacity: "0.6",
    },
    badge: {
      "font-size": "0.7em",
      padding: "1px 5px",
      "border-radius": "3px",
      "background-color": "rgba(255,255,255,0.08)",
      opacity: "0.7",
    },
  },

  build(_props, ctx) {
    const { dispatch, useSelector } = ctx;

    // Pre-merge footer: confirm button
    const { part: mergeButton } = ctx.render(ButtonWithConfirmation, {
      id: CR.MERGE_BTN,
      label: "Merge to Story Engine",
      confirmLabel: "Populate DULFS fields?",
      onConfirm: () => dispatch(crucibleMergeRequested()),
      style: { marginTop: "4px" },
    });

    const isMerged = ctx.getState().crucible.merged;
    const mergedFooter = text({
      id: "cr-merged-footer",
      text: "✓ Merged to DULFS",
      markdown: true,
      style: isMerged ? this.style?.("mergedText") : this.style?.("hidden"),
    });
    const preMergeFooter = column({
      id: "cr-premerge-footer",
      style: isMerged ? this.style?.("hidden") : {},
      content: [mergeButton],
    });

    // Expansion input + button (pre-rendered, stable)
    const expansionInput = multilineTextInput({
      id: "cr-expand-prompt-input",
      placeholder: "What to explore? Leave blank to find what's missing.",
      storageKey: "story:cr-expand-prompt",
      style: { "font-size": "0.85em" },
    });
    const { part: expandGenBtn } = ctx.render(GenerationButton, {
      id: "cr-expand-gen-btn",
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

    // Caches
    const prereqCardCache = new Map<string, UIPart>();
    const elementCardCache = new Map<string, UIPart>();

    // --- Prerequisite Cards ---
    const ensurePrereqCard = (prereq: Prerequisite): UIPart => {
      if (!prereqCardCache.has(prereq.id)) {
        prereqCardCache.set(prereq.id, column({
          id: CR.prereq(prereq.id).ROOT,
          style: this.style?.("prereqCard"),
          content: [
            row({
              style: { gap: "6px", "align-items": "center" },
              content: [
                text({ text: prereq.category, style: this.style?.("badge") }),
                text({
                  id: CR.prereq(prereq.id).TEXT,
                  text: escapeViewText(prereq.element),
                  markdown: true,
                  style: { "font-size": "0.85em", flex: "1" },
                }),
                button({
                  text: "",
                  iconId: "trash-2",
                  style: this.style?.("deleteBtn"),
                  callback: () => dispatch(prerequisiteRemoved({ id: prereq.id })),
                }),
              ],
            }),
            text({
              text: `_${prereq.loadBearing}_`,
              markdown: true,
              style: { "font-size": "0.8em", opacity: "0.6" },
            }),
          ],
        }));
      }
      return prereqCardCache.get(prereq.id)!;
    };

    // --- Element Cards ---
    const ensureElementCard = (el: CrucibleWorldElement): UIPart => {
      if (!elementCardCache.has(el.id)) {
        const { part: editable } = ctx.render(EditableText, {
          id: CR.element(el.id).TEXT,
          getContent: () => {
            const current = ctx.getState().crucible.elements.find((e) => e.id === el.id);
            return current ? formatElementText(current) : formatElementText(el);
          },
          placeholder: "Name: description...",
          initialDisplay: escapeViewText(formatElementDisplay(el)),
          onSave: (raw: string) => {
            const parsed = parseElementText(raw);
            dispatch(elementUpdated({
              id: el.id,
              name: parsed.name,
              content: parsed.content,
            }));
          },
          label: el.name,
          extraControls: [
            button({
              text: "",
              iconId: "trash-2",
              style: this.style?.("deleteBtn"),
              callback: () => dispatch(elementRemoved({ id: el.id })),
            }),
          ],
        });

        const { part: expandBtn } = ctx.render(GenerationButton, {
          id: `${CR.element(el.id).ROOT}-expand`,
          label: "Expand",
          style: { "font-size": "0.75em", padding: "2px 6px", "font-weight": "normal" },
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

        elementCardCache.set(el.id, column({
          id: CR.element(el.id).ROOT,
          style: this.style?.("elementCard"),
          content: [
            row({
              style: { gap: "6px", "align-items": "center" },
              content: [
                text({ text: FIELD_LABEL_SINGULAR[el.fieldId] || el.fieldId, style: this.style?.("badge") }),
                expandBtn,
              ],
            }),
            editable,
          ],
        }));
      }
      return elementCardCache.get(el.id)!;
    };

    // --- Build sections ---
    const buildFullReview = (): UIPart[] => {
      const state = ctx.getState();
      const parts: UIPart[] = [];

      // Prerequisites section
      if (state.crucible.prerequisites.length > 0) {
        const prereqParts = state.crucible.prerequisites.map((p) => ensurePrereqCard(p));
        parts.push(collapsibleSection({
          id: CR.PREREQS_SECTION,
          title: `Prerequisites (${state.crucible.prerequisites.length})`,
          storageKey: "story:cr-prereqs-section",
          content: prereqParts,
        }));
      }

      // Elements section (grouped by field)
      if (state.crucible.elements.length > 0) {
        const elementsByField = new Map<DulfsFieldID, CrucibleWorldElement[]>();
        for (const el of state.crucible.elements) {
          const list = elementsByField.get(el.fieldId) || [];
          list.push(el);
          elementsByField.set(el.fieldId, list);
        }

        const elementParts: UIPart[] = [];
        for (const [fieldId, fieldElements] of elementsByField) {
          elementParts.push(text({ text: FIELD_LABELS[fieldId] || fieldId, style: this.style?.("sectionTitle") }));
          for (const el of fieldElements) {
            elementParts.push(ensureElementCard(el));
          }
        }

        parts.push(collapsibleSection({
          id: CR.ELEMENTS_SECTION,
          title: `World Elements (${state.crucible.elements.length})`,
          storageKey: "story:cr-elements-section",
          content: elementParts,
        }));

        parts.push(column({
          id: "cr-expansion-section",
          style: { gap: "4px" },
          content: [
            text({ text: "Expand", style: this.style?.("sectionTitle") }),
            expansionInput,
            expandGenBtn,
          ],
        }));
      }

      parts.push(preMergeFooter);
      parts.push(mergedFooter);
      return parts;
    };

    // Reactive rebuild
    useSelector(
      (s) => ({
        prereqCount: s.crucible.prerequisites.length,
        elementIds: s.crucible.elements.map((e) => e.id).join(","),
        phase: s.crucible.phase,
        merged: s.crucible.merged,
      }),
      () => {
        const state = ctx.getState();
        if (state.crucible.phase !== "review") return;

        // Evict removed items from caches
        const currentPrereqIds = new Set(state.crucible.prerequisites.map((p) => p.id));
        for (const [id] of prereqCardCache) {
          if (!currentPrereqIds.has(id)) prereqCardCache.delete(id);
        }
        const currentElementIds = new Set(state.crucible.elements.map((e) => e.id));
        for (const [id] of elementCardCache) {
          if (!currentElementIds.has(id)) elementCardCache.delete(id);
        }

        const sections = buildFullReview();
        const merged = state.crucible.merged;
        api.v1.ui.updateParts([
          { id: CR.REVIEW_ROOT, style: this.style?.("root"), content: sections },
        ]);
        // Re-apply footer styles after content rebuild (build-time styles may be stale)
        api.v1.ui.updateParts([
          { id: "cr-merged-footer", style: merged ? this.style?.("mergedText") : this.style?.("hidden") },
          { id: "cr-premerge-footer", style: merged ? this.style?.("hidden") : {} },
        ]);

        // Update view text for elements
        for (const el of state.crucible.elements) {
          const viewText = escapeViewText(formatElementDisplay(el));
          api.v1.ui.updateParts([
            { id: `${CR.element(el.id).TEXT}-view`, text: viewText },
          ]);
        }
      },
    );

    // Build initial state
    const state = ctx.getState();
    if (state.crucible.phase === "review") {
      const initialSections = buildFullReview();
      return column({
        id: CR.REVIEW_ROOT,
        style: this.style?.("root"),
        content: initialSections,
      });
    }

    return column({
      id: CR.REVIEW_ROOT,
      style: this.style?.("hidden"),
      content: [],
    });
  },
});
