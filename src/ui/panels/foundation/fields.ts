// Config-driven Foundation field table + pure helpers. Drives the five
// card-fields (Shape, Intent, Contract, ATTG, Style); Intensity has its own
// component. The pure helpers (parseContract / formatContract /
// isFoundationGenerating) are framework-free and unit-tested; the descriptors
// close over store dispatch, mirroring SUI's SeFoundationSection.

import {
  store,
  shapeUpdated,
  intentUpdated,
  contractUpdated,
  attgUpdated,
  styleUpdated,
  attgSyncToggled,
  styleSyncToggled,
  shapeGenerationRequested,
  intentGenerationRequested,
  contractGenerationRequested,
  attgGenerationRequested,
  styleGenerationRequested,
  type RootState,
  type ContractData,
} from "../../../core/store";

export type FoundationFieldId =
  "shape" | "intent" | "contract" | "attg" | "style";

export type IntensityLevelDef = { level: string; description: string };

// Same five levels + copy as SUI's SeFoundationSection.INTENSITY_LEVELS.
export const INTENSITY_LEVELS: IntensityLevelDef[] = [
  {
    level: "Cozy",
    description:
      "Safe, warm, low stakes — threats are social or emotional, no one is in real danger.",
  },
  {
    level: "Grounded",
    description:
      "Real-world friction and consequences; setbacks matter but survival is assumed.",
  },
  {
    level: "Gritty",
    description:
      "Serious harm is possible; moral compromise is common; comfort is earned, not given.",
  },
  {
    level: "Noir",
    description:
      "No clean exits; moral corruption is systemic; characters pay real prices for their choices.",
  },
  {
    level: "Nightmare",
    description:
      "High lethality, psychological extremity; no guaranteed safety for anyone.",
  },
];

/** Parse a REQUIRED/PROHIBITED/EMPHASIS block into ContractData, or null if
 *  blank. Missing lines become empty strings (matches SUI's regex behavior). */
export function parseContract(text: string): ContractData | null {
  if (!text.trim()) return null;
  const required = text.match(/^REQUIRED:\s*(.+)$/m)?.[1]?.trim() || "";
  const prohibited = text.match(/^PROHIBITED:\s*(.+)$/m)?.[1]?.trim() || "";
  const emphasis = text.match(/^EMPHASIS:\s*(.+)$/m)?.[1]?.trim() || "";
  return { required, prohibited, emphasis };
}

/** Format ContractData as the editable REQUIRED/PROHIBITED/EMPHASIS block. */
export function formatContract(c: ContractData | null): string {
  if (!c) return "";
  return `REQUIRED: ${c.required}\nPROHIBITED: ${c.prohibited}\nEMPHASIS: ${c.emphasis}`;
}

/** Human-readable, one-part-per-line contract text for the card display. */
function displayContract(c: ContractData | null): string {
  if (!c) return "";
  return `Required: ${c.required}\nProhibited: ${c.prohibited}\nEmphasis: ${c.emphasis}`;
}

/** True while a foundation request for `fieldId` is queued or active.
 *  Mirrors SUI's foundationProjection. */
export function isFoundationGenerating(
  s: RootState,
  fieldId: FoundationFieldId,
): boolean {
  const inQueue = s.runtime.queue.some(
    (r) => r.type === "foundation" && r.targetId === fieldId,
  );
  const active =
    s.runtime.activeRequest?.type === "foundation" &&
    s.runtime.activeRequest.targetId === fieldId;
  return inQueue || active;
}

/** Push ATTG→Memory / Style→A.N. when their sync toggles are on. */
export async function syncMemory(): Promise<void> {
  const { attg, style, attgSyncEnabled, styleSyncEnabled } =
    store.getState().foundation;
  if (attgSyncEnabled) await api.v1.memory.set(attg.trim());
  if (styleSyncEnabled) await api.v1.an.set(style.trim());
}

export type FieldDraft = { title: string; content: string };

export type FieldDescriptor = {
  id: FoundationFieldId;
  label: string;
  titled?: boolean; // Shape only — editor shows a title input
  hasRefine: boolean; // false for Shape (generate-only)
  hasSync?: boolean; // ATTG, Style
  cardLabel: (s: RootState) => string; // Shape shows the shape name
  display: (s: RootState) => string; // derived card text
  seed: (s: RootState) => FieldDraft; // opens the editor
  commit: (draft: FieldDraft) => void; // dispatch + (attg/style) sync
  generate: () => void; // dispatch <field>GenerationRequested
  refineSource: (s: RootState) => string; // text handed to refine
  placeholder: string;
  titlePlaceholder?: string;
  syncEnabled?: (s: RootState) => boolean;
  toggleSync?: () => void;
};

export const FIELD_DESCRIPTORS: FieldDescriptor[] = [
  {
    id: "shape",
    label: "Shape",
    titled: true,
    hasRefine: false,
    cardLabel: (s) => s.foundation.shape?.name || "Shape",
    display: (s) => s.foundation.shape?.description ?? "",
    seed: (s) => ({
      title: s.foundation.shape?.name ?? "",
      content: s.foundation.shape?.description ?? "",
    }),
    commit: ({ title, content }) =>
      store.dispatch(
        shapeUpdated({
          shape:
            title || content
              ? { name: title || "STORY", description: content }
              : null,
        }),
      ),
    generate: () => store.dispatch(shapeGenerationRequested()),
    refineSource: (s) => s.foundation.shape?.description ?? "",
    placeholder:
      "Shape description — what structural moments this story leans toward.",
    titlePlaceholder: "e.g. Slice of Life, Tragedy, Heist…",
  },
  {
    id: "intent",
    label: "Intent",
    hasRefine: true,
    cardLabel: () => "Intent",
    display: (s) => s.foundation.intent,
    seed: (s) => ({ title: "", content: s.foundation.intent }),
    commit: ({ content }) => store.dispatch(intentUpdated({ intent: content })),
    generate: () => store.dispatch(intentGenerationRequested()),
    refineSource: (s) => s.foundation.intent,
    placeholder: "What is this story about? What do you want to explore?",
  },
  {
    id: "contract",
    label: "Story Contract",
    hasRefine: true,
    cardLabel: () => "Story Contract",
    display: (s) => displayContract(s.foundation.contract),
    seed: (s) => ({
      title: "",
      content: formatContract(s.foundation.contract),
    }),
    commit: ({ content }) =>
      store.dispatch(contractUpdated({ contract: parseContract(content) })),
    generate: () => store.dispatch(contractGenerationRequested()),
    refineSource: (s) => formatContract(s.foundation.contract),
    placeholder: "REQUIRED: ...\nPROHIBITED: ...\nEMPHASIS: ...",
  },
  {
    id: "attg",
    label: "ATTG (Memory)",
    hasRefine: true,
    hasSync: true,
    cardLabel: () => "ATTG (Memory)",
    display: (s) => s.foundation.attg,
    seed: (s) => ({ title: "", content: s.foundation.attg }),
    commit: ({ content }) => {
      store.dispatch(attgUpdated({ attg: content }));
      void syncMemory();
    },
    generate: () => store.dispatch(attgGenerationRequested()),
    refineSource: (s) => s.foundation.attg,
    placeholder: "Author, Title, Tags, Genre…",
    syncEnabled: (s) => s.foundation.attgSyncEnabled,
    toggleSync: () => {
      store.dispatch(attgSyncToggled());
      void syncMemory();
    },
  },
  {
    id: "style",
    label: "Style (Author's Note)",
    hasRefine: true,
    hasSync: true,
    cardLabel: () => "Style (Author's Note)",
    display: (s) => s.foundation.style,
    seed: (s) => ({ title: "", content: s.foundation.style }),
    commit: ({ content }) => {
      store.dispatch(styleUpdated({ style: content }));
      void syncMemory();
    },
    generate: () => store.dispatch(styleGenerationRequested()),
    refineSource: (s) => s.foundation.style,
    placeholder: "Writing style, tone, prose directives…",
    syncEnabled: (s) => s.foundation.styleSyncEnabled,
    toggleSync: () => {
      store.dispatch(styleSyncToggled());
      void syncMemory();
    },
  },
];
