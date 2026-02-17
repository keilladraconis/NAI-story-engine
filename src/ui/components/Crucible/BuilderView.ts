import { defineComponent } from "nai-act";
import { RootState, CrucibleWorldElement } from "../../../core/store/types";
import { IDS } from "../../framework/ids";
import { FieldID, DulfsFieldID } from "../../../config/field-definitions";
import {
  builderElementUpdated,
  builderElementRemoved,
  crucibleMergeRequested,
} from "../../../core/store/slices/crucible";
import { EditableText } from "../EditableText";
import { ButtonWithConfirmation } from "../ButtonWithConfirmation";
import {
  NAI_HEADER,
} from "../../colors";

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

/** Group elements by fieldId for display. */
function groupByField(elements: CrucibleWorldElement[]): Map<DulfsFieldID, CrucibleWorldElement[]> {
  const groups = new Map<DulfsFieldID, CrucibleWorldElement[]>();
  for (const el of elements) {
    const list = groups.get(el.fieldId) || [];
    list.push(el);
    groups.set(el.fieldId, list);
  }
  return groups;
}

/** Format element as "Name: content" for the editable text field. */
function formatElementText(el: CrucibleWorldElement): string {
  return el.content ? `${el.name}: ${el.content}` : el.name;
}

/** Escape text for markdown view display. */
function escapeViewText(raw: string): string {
  return raw.replace(/\n/g, "  \n").replace(/</g, "\\<") || "_No content._";
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

/** Storage key for an element's editable text. */
function elementStorageKey(elementId: string): string {
  return `cr-element-${elementId}`;
}

export const BuilderView = defineComponent<undefined, RootState>({
  id: () => CR.BUILDER_ROOT,

  styles: {
    hidden: { display: "none" },
    root: {
      gap: "6px",
    },
    sectionTitle: {
      "font-size": "0.75em",
      "font-weight": "bold",
      "text-transform": "uppercase",
      opacity: "0.6",
    },
    divider: {
      "border-top": "1px solid rgba(255,255,255,0.08)",
      margin: "4px 0",
    },
    nodeCard: {
      padding: "4px 8px",
      "border-radius": "3px",
      "background-color": "rgba(255,255,255,0.03)",
      "border-left": "2px solid rgba(129,212,250,0.4)",
      gap: "2px",
    },
    deleteBtn: {
      opacity: "0.6",
    },
  },

  build(_props, ctx) {
    const { dispatch, useSelector } = ctx;

    // Merge button — mounted once, visibility controlled by useSelector
    const { part: mergeButton } = ctx.render(ButtonWithConfirmation, {
      id: "cr-merge-btn",
      label: "Merge to Story Engine",
      confirmLabel: "Populate DULFS fields?",
      onConfirm: () => dispatch(crucibleMergeRequested()),
      style: { marginTop: "4px" },
    });

    // Track merge button visibility
    useSelector(
      (s) => {
        const hasElements = s.crucible.builder.elements.length > 0;
        const starredGoals = s.crucible.goals.filter((g) => g.starred);
        const allComplete = starredGoals.length > 0 && starredGoals.every((g) => {
          const chain = s.crucible.chains[g.id];
          return chain?.complete;
        });
        return hasElements && allComplete;
      },
      (showMerge) => {
        api.v1.ui.updateParts([{
          id: "cr-merge-btn",
          style: { display: showMerge ? "flex" : "none", marginTop: "4px" },
        }]);
      },
    );

    // Mount-once cache: elementId → full card UIPart (including EditableText)
    const elementCardCache = new Map<string, UIPart>();

    /** Ensure an element card exists in the cache, mounting EditableText once.
     *  Caller must seed storyStorage BEFORE calling this. */
    const ensureElementCard = (el: CrucibleWorldElement): UIPart => {
      if (!elementCardCache.has(el.id)) {
        const storageKey = elementStorageKey(el.id);

        const { part: editable } = ctx.render(EditableText, {
          id: `cr-element-${el.id}-text`,
          storageKey,
          placeholder: "Name: description...",
          initialDisplay: formatElementText(el),
          onSave: (raw: string) => {
            const parsed = parseElementText(raw);
            dispatch(builderElementUpdated({
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
              callback: () => {
                dispatch(builderElementRemoved({ id: el.id }));
                api.v1.storyStorage.set(storageKey, "");
              },
            }),
          ],
        });

        elementCardCache.set(el.id, column({
          id: `cr-element-card-${el.id}`,
          style: this.style?.("nodeCard"),
          content: [editable],
        }));
      }
      return elementCardCache.get(el.id)!;
    };

    /** Build the grouped section UIParts from current elements. */
    const buildSections = (elements: CrucibleWorldElement[]): UIPart[] => {
      const groups = groupByField(elements);
      const sectionParts: UIPart[] = [
        row({ style: this.style?.("divider"), content: [] }),
        text({ text: "World Elements", style: { ...this.style?.("sectionTitle"), color: NAI_HEADER } }),
      ];

      for (const [fieldId, fieldElements] of groups) {
        const label = FIELD_LABELS[fieldId] || fieldId;
        sectionParts.push(
          text({ text: label, style: this.style?.("sectionTitle") }),
        );
        for (const el of fieldElements) {
          sectionParts.push(ensureElementCard(el));
        }
      }
      sectionParts.push(mergeButton);
      return sectionParts;
    };

    useSelector(
      (s) => s.crucible.builder.elements,
      (elements) => {
        // Evict removed elements from cache
        const currentIds = new Set(elements.map((e) => e.id));
        for (const [id] of elementCardCache) {
          if (!currentIds.has(id)) {
            elementCardCache.delete(id);
          }
        }

        if (elements.length === 0) {
          api.v1.ui.updateParts([
            { id: CR.BUILDER_ROOT, style: this.style?.("hidden"), content: [] },
          ]);
          return;
        }

        // Seed storyStorage for all elements BEFORE building sections
        for (const el of elements) {
          api.v1.storyStorage.set(elementStorageKey(el.id), formatElementText(el));
        }

        // Build section tree (ensureElementCard mounts new EditableTexts once, reuses after)
        const sectionParts = buildSections(elements);

        // Place tree — all view IDs now exist after this call
        api.v1.ui.updateParts([
          { id: CR.BUILDER_ROOT, style: this.style?.("root"), content: sectionParts },
        ]);

        // NOW update view text — view IDs are in the tree
        for (const el of elements) {
          const viewText = escapeViewText(formatElementText(el));
          api.v1.ui.updateParts([
            { id: `cr-element-${el.id}-text-view`, text: viewText },
          ]);
        }

      },
    );

    // Build initial state from persisted data (useSelector won't fire on mount)
    const initialElements = ctx.getState().crucible.builder.elements;
    if (initialElements.length > 0) {
      for (const el of initialElements) {
        api.v1.storyStorage.set(elementStorageKey(el.id), formatElementText(el));
      }
      const initialSections = buildSections(initialElements);
      return column({
        id: CR.BUILDER_ROOT,
        style: this.style?.("root"),
        content: initialSections,
      });
    }

    return column({
      id: CR.BUILDER_ROOT,
      style: this.style?.("hidden"),
      content: [],
    });
  },
});
