import { defineComponent } from "nai-act";
import { RootState, CrucibleWorldElement, CrucibleLink, WORLD_ENTRY_CATEGORIES } from "../../../core/store/types";
import { IDS, STORAGE_KEYS } from "../../framework/ids";
import { FieldID, DulfsFieldID } from "../../../config/field-definitions";
import {
  crucibleStopRequested,
  crucibleBuildPassRequested,
  crucibleCastRequested,
  elementRemoved,
  elementUpdated,
  linkRemoved,
} from "../../../core/store/slices/crucible";
import { GenerationButton } from "../GenerationButton";
import { ButtonWithConfirmation } from "../ButtonWithConfirmation";
import { EditableText } from "../EditableText";
import { escapeForMarkdown } from "../../utils";

const { text, row, column, collapsibleSection, button, multilineTextInput } = api.v1.ui.part;

const CR = IDS.CRUCIBLE;

/** Map World Entry field IDs to display labels. */
const FIELD_LABELS: Record<DulfsFieldID, string> = {
  [FieldID.DramatisPersonae]: "Characters",
  [FieldID.UniverseSystems]: "Systems",
  [FieldID.Locations]: "Locations",
  [FieldID.Factions]: "Factions",
  [FieldID.SituationalDynamics]: "Narrative Vectors",
  [FieldID.Topics]: "Topics",
};

const FIELD_LABEL_SINGULAR: Record<DulfsFieldID, string> = {
  [FieldID.DramatisPersonae]: "Character",
  [FieldID.UniverseSystems]: "System",
  [FieldID.Locations]: "Location",
  [FieldID.Factions]: "Faction",
  [FieldID.SituationalDynamics]: "Narrative Vector",
  [FieldID.Topics]: "Topic",
};

/** Format element for display (name in bold + content). */
function formatElementDisplay(el: CrucibleWorldElement): string {
  return el.content ? `**${el.name}**\n${el.content}` : `**${el.name}**`;
}

/** Format raw "Name: content" edit text for display. */
function formatRawElementDisplay(raw: string): string {
  const { name, content } = parseElementText(raw);
  return content ? `**${name}**\n${content}` : `**${name}**`;
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

export const BuildPassView = defineComponent<undefined, RootState>({
  id: () => CR.BUILD_PASS_ROOT,

  styles: {
    hidden: { display: "none" },
    root: {
      gap: "8px",
      padding: "12px",
      "border-radius": "6px",
      "background-color": "rgba(255,255,255,0.03)",
    },
    worldSummary: {
      "font-size": "0.85em",
      "font-weight": "bold",
      opacity: "0.9",
    },
    logText: {
      "font-size": "0.8em",
      opacity: "0.7",
      "white-space": "pre-wrap",
    },
    critiqueText: {
      "font-size": "0.85em",
      opacity: "0.8",
      padding: "6px 8px",
      "border-radius": "4px",
      "background-color": "rgba(255,183,77,0.1)",
      "border-left": "3px solid rgba(255,183,77,0.4)",
    },
    guidanceLabel: {
      "font-size": "0.8em",
      opacity: "0.6",
    },
    // Review-absorbed styles
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
    elementCard: {
      padding: "4px 8px",
      "border-radius": "3px",
      "background-color": "rgba(255,255,255,0.03)",
      "border-left": "2px solid rgba(129,212,250,0.4)",
      gap: "2px",
    },
    linkCard: {
      padding: "4px 8px",
      "border-radius": "3px",
      "background-color": "rgba(255,255,255,0.03)",
      "border-left": "2px solid rgba(168,143,219,0.4)",
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
    summarySection: {
      gap: "6px",
      padding: "10px 12px",
      "border-radius": "6px",
      "background-color": "rgba(255,255,255,0.03)",
      "border": "1px solid rgba(129,212,250,0.15)",
    },
    summaryText: {
      "font-size": "0.85em",
      opacity: "0.8",
    },
  },

  build(_props, ctx) {
    const { dispatch, useSelector } = ctx;
    const state = ctx.getState();

    // --- Element & Link caches (from ReviewView) ---
    const elementCardCache = new Map<string, UIPart>();
    const linkCardCache = new Map<string, UIPart>();

    const ensureElementCard = (el: CrucibleWorldElement): UIPart => {
      if (!elementCardCache.has(el.id)) {
        const { part: editable } = ctx.render(EditableText, {
          id: CR.element(el.id).TEXT,
          getContent: () => {
            const current = ctx.getState().crucible.elements.find((e) => e.id === el.id);
            return current ? formatElementText(current) : formatElementText(el);
          },
          placeholder: "Name: description...",
          formatDisplay: formatRawElementDisplay,
          onSave: (raw: string) => {
            const parsed = parseElementText(raw);
            dispatch(elementUpdated({
              id: el.id,
              name: parsed.name,
              content: parsed.content,
            }));
          },
          extraControls: [
            button({
              text: "",
              iconId: "trash-2",
              style: this.style?.("deleteBtn"),
              callback: () => dispatch(elementRemoved({ id: el.id })),
            }),
          ],
        });

        elementCardCache.set(el.id, column({
          id: CR.element(el.id).ROOT,
          style: this.style?.("elementCard"),
          content: [
            row({
              style: { gap: "6px", "align-items": "center" },
              content: [
                text({ text: FIELD_LABEL_SINGULAR[el.fieldId] || el.fieldId, style: this.style?.("badge") }),
              ],
            }),
            editable,
          ],
        }));
      }
      return elementCardCache.get(el.id)!;
    };

    const ensureLinkCard = (link: CrucibleLink): UIPart => {
      if (!linkCardCache.has(link.id)) {
        const desc = link.description ? ` — ${link.description}` : "";
        linkCardCache.set(link.id, column({
          id: CR.link(link.id).ROOT,
          style: this.style?.("linkCard"),
          content: [
            row({
              style: { gap: "6px", "align-items": "center" },
              content: [
                text({
                  text: `**${link.fromName}** → **${link.toName}**${desc}`,
                  markdown: true,
                  style: { "font-size": "0.85em", flex: "1" },
                }),
                button({
                  text: "",
                  iconId: "trash-2",
                  style: this.style?.("deleteBtn"),
                  callback: () => dispatch(linkRemoved({ id: link.id })),
                }),
              ],
            }),
          ],
        }));
      }
      return linkCardCache.get(link.id)!;
    };

    // --- Build element/link sections ---
    const buildWorldSections = (): UIPart[] => {
      const s = ctx.getState();
      const parts: UIPart[] = [];

      // Links section
      if (s.crucible.links.length > 0) {
        const linkParts = s.crucible.links.map((l) => ensureLinkCard(l));
        parts.push(collapsibleSection({
          id: "cr-links-section",
          title: `Relationships (${s.crucible.links.length})`,
          storageKey: STORAGE_KEYS.CR_LINKS_SECTION_UI,
          content: linkParts,
        }));
      }

      // Elements section (grouped by field)
      if (s.crucible.elements.length > 0) {
        const elementsByField = new Map<DulfsFieldID, CrucibleWorldElement[]>();
        for (const el of s.crucible.elements) {
          const list = elementsByField.get(el.fieldId) || [];
          list.push(el);
          elementsByField.set(el.fieldId, list);
        }

        const elementParts: UIPart[] = [];
        for (const fieldId of WORLD_ENTRY_CATEGORIES) {
          const fieldElements = elementsByField.get(fieldId);
          if (!fieldElements) continue;
          elementParts.push(text({ text: FIELD_LABELS[fieldId] || fieldId, style: this.style?.("sectionTitle") }));
          for (const el of fieldElements) {
            elementParts.push(ensureElementCard(el));
          }
        }

        parts.push(collapsibleSection({
          id: CR.ELEMENTS_SECTION,
          title: `World Elements (${s.crucible.elements.length})`,
          storageKey: STORAGE_KEYS.CR_ELEMENTS_SECTION_UI,
          content: elementParts,
        }));
      }

      return parts;
    };

    // --- World summary counts ---
    const buildSummaryCount = (): string => {
      const s = ctx.getState();
      if (s.crucible.elements.length === 0) return "";
      const countsByField = new Map<DulfsFieldID, number>();
      for (const el of s.crucible.elements) {
        countsByField.set(el.fieldId, (countsByField.get(el.fieldId) || 0) + 1);
      }
      const summaryParts: string[] = [];
      for (const fieldId of WORLD_ENTRY_CATEGORIES) {
        const count = countsByField.get(fieldId);
        if (count) summaryParts.push(`${count} ${count === 1 ? FIELD_LABEL_SINGULAR[fieldId] : FIELD_LABELS[fieldId]}`);
      }
      if (s.crucible.links.length > 0) {
        const lc = s.crucible.links.length;
        summaryParts.push(`${lc} ${lc === 1 ? "Link" : "Links"}`);
      }
      return `Your world: **${summaryParts.join("** · **")}**`;
    };

    // --- Command log ---
    const initialLog = state.crucible.passes
      .flatMap((p) => [`--- Pass ${p.passNumber} ---`, ...p.commandLog])
      .join("\n") || "_Waiting for first pass..._";

    // --- Next Pass generation button ---
    const { part: nextPassBtn } = ctx.render(GenerationButton, {
      id: CR.BUILD_PASS_BTN,
      label: "Next Pass",
      variant: "button",
      stateProjection: (s: RootState) => ({
        activeType: s.runtime.activeRequest?.type,
        queueLen: s.runtime.queue.length,
        hasTensions: s.crucible.tensions.some((t) => t.accepted),
      }),
      requestIdFromProjection: () => {
        const s = ctx.getState();
        if (s.runtime.activeRequest?.type === "crucibleBuildPass") return s.runtime.activeRequest.id;
        return s.runtime.queue.find((q) => q.type === "crucibleBuildPass")?.id;
      },
      isDisabledFromProjection: (proj: { hasTensions: boolean }) => !proj.hasTensions,
      onCancel: () => dispatch(crucibleStopRequested()),
      onGenerate: () => dispatch(crucibleBuildPassRequested()),
    });


    // --- Merge button (from ReviewView) ---
    const { part: mergeButton } = ctx.render(ButtonWithConfirmation, {
      id: CR.CAST_BTN,
      label: "Cast",
      confirmLabel: "Populate World Entry fields?",
      onConfirm: () => dispatch(crucibleCastRequested()),
      style: { marginTop: "4px" },
    });

    const isMerged = state.crucible.cast;

    // --- Guidance input ---
    const guidanceInput = multilineTextInput({
      id: "cr-build-guidance-input",
      placeholder: "Guide the next pass (e.g. 'more factions', 'Mira is too generic')...",
      storageKey: STORAGE_KEYS.CR_BUILD_GUIDANCE_UI,
      style: { "font-size": "0.85em" },
    });

    // --- Initial world sections ---
    const initialWorldSections = buildWorldSections();
    const initialSummaryCount = buildSummaryCount();

    // --- Reactive: update world summary, command log, critique, AND element/link sections ---
    useSelector(
      (s) => [
        s.crucible.elements.map((e) => e.id).join(","),
        s.crucible.links.map((l) => l.id).join(","),
        String(s.crucible.passes.length),
        s.crucible.activeCritique ?? "",
        String(s.crucible.cast),
      ].join("|"),
      (_key) => {
        const st = ctx.getState();

        // Command log
        const logLines = st.crucible.passes
          .flatMap((p) => [`--- Pass ${p.passNumber} ---`, ...p.commandLog])
          .join("\n") || "_Waiting for first pass..._";
        api.v1.ui.updateParts([
          { id: CR.BUILD_LOG, text: logLines },
        ]);

        // Critique display
        api.v1.ui.updateParts([
          st.crucible.activeCritique
            ? { id: "cr-critique-display", text: `**Self-critique:** ${st.crucible.activeCritique}`, style: this.style?.("critiqueText") }
            : { id: "cr-critique-display", text: "", style: { display: "none" } },
        ]);

        // Evict removed items from caches
        const currentElementIds = new Set(st.crucible.elements.map((e) => e.id));
        for (const [id] of elementCardCache) {
          if (!currentElementIds.has(id)) elementCardCache.delete(id);
        }
        const currentLinkIds = new Set(st.crucible.links.map((l) => l.id));
        for (const [id] of linkCardCache) {
          if (!currentLinkIds.has(id)) linkCardCache.delete(id);
        }

        // Rebuild world summary count
        const summaryCount = buildSummaryCount();
        api.v1.ui.updateParts([
          {
            id: "cr-review-summary",
            style: st.crucible.elements.length > 0 ? this.style?.("summarySection") : this.style?.("hidden"),
          },
          { id: "cr-review-summary-text", text: summaryCount },
        ]);

        // Rebuild element/link sections
        const sections = buildWorldSections();
        api.v1.ui.updateParts([
          { id: "cr-world-sections", content: sections },
        ]);

        // Update view text for elements
        for (const el of st.crucible.elements) {
          const viewText = escapeForMarkdown(formatElementDisplay(el), "_No content._");
          api.v1.ui.updateParts([
            { id: `${CR.element(el.id).TEXT}-view`, text: viewText },
          ]);
        }

        // Merged footer
        api.v1.ui.updateParts([
          { id: "cr-merged-footer", style: st.crucible.cast ? this.style?.("mergedText") : this.style?.("hidden") },
        ]);
      },
    );

    return column({
      id: CR.BUILD_PASS_ROOT,
      style: this.style?.("root"),
      content: [
        text({ text: "Build World", style: { "font-weight": "bold", "font-size": "0.9em" } }),
        // World summary count
        column({
          id: "cr-review-summary",
          style: state.crucible.elements.length > 0 ? this.style?.("summarySection") : this.style?.("hidden"),
          content: [
            text({
              id: "cr-review-summary-text",
              text: initialSummaryCount,
              markdown: true,
              style: this.style?.("summaryText"),
            }),
          ],
        }),
        // World element/link sections
        column({
          id: "cr-world-sections",
          content: initialWorldSections,
        }),
        // Command log
        collapsibleSection({
          id: "cr-log-section",
          title: "Command Log",
          storageKey: STORAGE_KEYS.CR_BUILD_LOG_COLLAPSED_UI,
          content: [
            text({
              id: CR.BUILD_LOG,
              text: initialLog,
              markdown: true,
              style: this.style?.("logText"),
            }),
          ],
        }),
        // Critique
        text({
          id: "cr-critique-display",
          text: "",
          markdown: true,
          style: state.crucible.activeCritique ? this.style?.("critiqueText") : { display: "none" },
        }),
        // Guidance
        text({ text: "Guidance for next pass:", style: this.style?.("guidanceLabel") }),
        guidanceInput,
        // Buttons
        nextPassBtn,
        // Merge
        column({
          id: "cr-merge-footer",
          content: [mergeButton],
        }),
        text({
          id: "cr-merged-footer",
          text: "✓ Merged to World Entries",
          markdown: true,
          style: isMerged ? this.style?.("mergedText") : this.style?.("hidden"),
        }),
      ],
    });
  },
});
