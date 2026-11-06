// Distill: compile the canon into what the story model reads (Memory, Author's
// Note, lorebook entries). The canon stays authoritative. Each target remembers
// the hash of its sources and of the text written, so it can tell:
//   current      sources unchanged, text as written
//   stale        the sources changed since it was compiled
//   hand-edited  someone edited the text Story Engine wrote
//   not compiled never written, or its entry was deleted
// A hand-edited target is never replaced without the writer saying so.

import {
  store,
  recordWritten,
  type CanonDoc,
  type DistillRecord,
  type RootState,
} from "./store";
import { runGlm, Cancelled } from "./engine/glm";
import { DISTILL_PROMPT, DISTILL_INSTRUCTIONS, KEYS_PROMPT } from "./prompts";
import { formatBrief } from "./facilitator";
import { attgLine } from "./workshop/frames";
import { SCENARIO_CATEGORY } from "./keys";
import { hashText } from "./text";

export type DistillStatus =
  "current" | "stale" | "hand-edited" | "not compiled";

export type Activation =
  | { kind: "always" }
  /** Keyed on the cast's names, no GLM call. */
  | { kind: "cast" }
  /** Keys written by GLM from the entry. */
  | { kind: "keys" };

export interface DistillTarget {
  id: string;
  label: string;
  write: "memory" | "an" | "entry";
  instruction: string;
  sources: string;
  maxTokens: number;
  activation: Activation;
  /** The canon documents it is compiled from, for the lorebook panel. */
  docIds: string[];
}

const docsOf = (state: RootState, ...kinds: CanonDoc["kind"][]) =>
  state.canon.docs.filter((d) => kinds.includes(d.kind) && d.text.trim());

const section = (title: string, text: string) =>
  text.trim() ? `# ${title}\n${text.trim()}` : "";

const docSections = (docs: CanonDoc[]) =>
  docs
    .map((d) => section(d.title, d.text))
    .filter(Boolean)
    .join("\n\n");

function startingSection(state: RootState): string {
  const { now, notYet } = state.canon.startingPoint;
  return section(
    "Starting point",
    `Now:\n${now.trim()}\n\nNot yet:\n${notYet.trim()}`,
  );
}

/** Every target the canon can be compiled into right now, in display order. */
export function distillTargets(state: RootState): DistillTarget[] {
  const { canon } = state;
  const dossiers = docsOf(state, "dossier");
  const relationships = docsOf(state, "relationships");
  const castNames = dossiers.map((d) => d.title).join(", ");
  const out: DistillTarget[] = [];
  const add = (t: DistillTarget) => {
    if (t.sources.trim()) out.push(t);
  };

  add({
    id: "memory",
    label: "Memory",
    write: "memory",
    instruction: DISTILL_INSTRUCTIONS.memory,
    sources: [
      section("Brief", formatBrief(canon.brief)),
      startingSection(state),
      castNames && section("Cast", castNames),
    ]
      .filter(Boolean)
      .join("\n\n"),
    maxTokens: 200,
    activation: { kind: "always" },
    docIds: [],
  });
  add({
    id: "an",
    label: "Author's Note · Style",
    write: "an",
    instruction: DISTILL_INSTRUCTIONS.an,
    sources: [
      section(
        "Voice",
        [canon.brief.voice, canon.brief.heat, canon.brief.pace]
          .filter((s) => s.trim())
          .join("; "),
      ),
      section("Tone samples", canon.vignettes.map((v) => v.text).join("\n\n")),
    ]
      .filter(Boolean)
      .join("\n\n"),
    maxTokens: 120,
    activation: { kind: "always" },
    docIds: [],
  });

  const world = docsOf(
    state,
    "geography",
    "history",
    "culture",
    "tensions",
    "factions",
    "system",
  );
  add({
    id: "entry:world",
    label: "World",
    write: "entry",
    instruction: DISTILL_INSTRUCTIONS.world,
    sources: world.length
      ? [docSections(world), startingSection(state)].join("\n\n")
      : "",
    maxTokens: 700,
    activation: { kind: "always" },
    docIds: world.map((d) => d.id),
  });
  add({
    id: "entry:dramatis",
    label: "Dramatis Personae",
    write: "entry",
    instruction: DISTILL_INSTRUCTIONS.dramatis,
    sources: docSections(dossiers),
    maxTokens: 120 + 70 * dossiers.length,
    activation: { kind: "always" },
    docIds: dossiers.map((d) => d.id),
  });
  for (const dossier of dossiers) {
    add({
      id: `entry:profile:${dossier.id}`,
      label: dossier.title,
      write: "entry",
      instruction: DISTILL_INSTRUCTIONS.profile,
      sources: [
        section(`${dossier.title} (dossier)`, dossier.text),
        docSections(relationships),
        startingSection(state),
      ]
        .filter(Boolean)
        .join("\n\n"),
      maxTokens: 900,
      activation: { kind: "keys" },
      docIds: [dossier.id, ...relationships.map((d) => d.id)],
    });
  }
  const locations = docsOf(state, "locations");
  add({
    id: "entry:locations",
    label: "Locations",
    write: "entry",
    instruction: DISTILL_INSTRUCTIONS.locations,
    sources: docSections(locations),
    maxTokens: 900,
    activation: { kind: "keys" },
    docIds: locations.map((d) => d.id),
  });
  add({
    id: "entry:relationships",
    label: "Relationship Map",
    write: "entry",
    instruction: DISTILL_INSTRUCTIONS.relationships,
    sources: docSections(relationships),
    maxTokens: 500,
    activation: { kind: "cast" },
    docIds: relationships.map((d) => d.id),
  });
  const plots = docsOf(state, "plots");
  add({
    id: "entry:plots",
    label: "Plot Situations",
    write: "entry",
    instruction: DISTILL_INSTRUCTIONS.plots,
    sources: plots.length
      ? [docSections(plots), startingSection(state)].join("\n\n")
      : "",
    maxTokens: 800,
    activation: { kind: "cast" },
    docIds: plots.map((d) => d.id),
  });
  return out;
}

export function statusOf(
  target: DistillTarget,
  record: DistillRecord | undefined,
  currentText: string | null,
): DistillStatus {
  if (!record || currentText === null) return "not compiled";
  if (hashText(currentText) !== record.writtenHash) return "hand-edited";
  if (hashText(target.sources) !== record.sourceHash) return "stale";
  return "current";
}

/** The text the target holds now, or null when it is gone. */
export async function readCurrent(
  target: DistillTarget,
  record: DistillRecord | undefined,
): Promise<string | null> {
  if (target.write === "memory") return record ? api.v1.memory.get() : null;
  if (target.write === "an") return record ? api.v1.an.get() : null;
  if (!record?.entryId) return null;
  const entry = await api.v1.lorebook.entry(record.entryId);
  return entry ? (entry.text ?? "") : null;
}

export async function statuses(
  state: RootState,
): Promise<Record<string, DistillStatus>> {
  const out: Record<string, DistillStatus> = {};
  for (const target of distillTargets(state)) {
    const record = state.distill.records[target.id];
    out[target.id] = statusOf(
      target,
      record,
      await readCurrent(target, record),
    );
  }
  return out;
}

// ── Writing ──────────────────────────────────────────────────────────────────

const HEAT_WORDS = /explicit|erotic|suggestive|nsfw|sexual|adult/i;
const NEGATED = /\b(no|not|non|nothing|never|none)\b/i;

/** Does the Brief's heat call for the adults line? "Nothing explicit" does not. */
export function adultHeat(heat: string): boolean {
  return HEAT_WORDS.test(heat) && !NEGATED.test(heat);
}

/** Wrap compiled text the way its destination expects it. */
export function finish(
  target: DistillTarget,
  compiled: string,
  state: RootState,
): string {
  if (target.write === "memory") {
    return [
      attgLine(state.canon.brief),
      compiled.trim(),
      adultHeat(state.canon.brief.heat)
        ? "All characters are adults over 18."
        : "",
    ]
      .filter(Boolean)
      .join("\n");
  }
  if (target.write === "an")
    return `[ Style: ${compiled.trim().replace(/^\[\s*Style:\s*|\s*\]$/g, "")} ]`;
  return compiled.trim();
}

/** Names that key a cast-wide entry: each name, and a first name when there is one. */
export function castKeys(state: RootState): string[] {
  return [
    ...new Set(docsOf(state, "dossier").flatMap((d) => nameKeys(d.title))),
  ];
}

/** A name as keys: the whole name, and the first name when it has one. */
export function nameKeys(name: string): string[] {
  const whole = name.trim().toLowerCase();
  if (!whole) return [];
  const first = whole.split(/\s+/)[0];
  return first !== whole && first.length > 2 ? [whole, first] : [whole];
}

export function parseKeys(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/[,\n]/)
        .map((k) =>
          k
            .trim()
            .toLowerCase()
            .replace(/^["'\-\s]+|["'\s]+$/g, ""),
        )
        .filter((k) => k.length > 1),
    ),
  ].slice(0, 12);
}

async function ensureCategory(): Promise<string> {
  const found = (await api.v1.lorebook.categories()).find(
    (c) => c.name === SCENARIO_CATEGORY,
  );
  return found
    ? found.id
    : api.v1.lorebook.createCategory({ name: SCENARIO_CATEGORY });
}

async function keysFor(
  target: DistillTarget,
  text: string,
  state: RootState,
): Promise<string[]> {
  if (target.activation.kind === "cast") return castKeys(state);
  if (target.activation.kind !== "keys") return [];
  const reply = await runGlm({
    id: api.v1.uuid(),
    label: `Keys for ${target.label}`,
    maxTokens: 80,
    temperature: 0.3,
    messages: async () => ({
      messages: [
        { role: "system", content: KEYS_PROMPT },
        { role: "user", content: `# ${target.label}\n${text}` },
      ],
    }),
  });
  // A profile is always keyed on the name the story will use for the character;
  // GLM has left out the first name.
  const names = target.id.startsWith("entry:profile:")
    ? nameKeys(target.label)
    : [];
  return [...new Set([...names, ...parseKeys(reply)])];
}

async function write(
  target: DistillTarget,
  text: string,
  record: DistillRecord | undefined,
  state: RootState,
): Promise<string | undefined> {
  if (target.write === "memory") {
    await api.v1.memory.set(text);
    return undefined;
  }
  if (target.write === "an") {
    await api.v1.an.set(text);
    return undefined;
  }
  const keys = await keysFor(target, text, state);
  const fields = {
    displayName: target.label,
    text,
    keys,
    forceActivation: target.activation.kind === "always",
    enabled: true,
  };
  if (record?.entryId && (await api.v1.lorebook.entry(record.entryId))) {
    await api.v1.lorebook.updateEntry(record.entryId, fields);
    return record.entryId;
  }
  return api.v1.lorebook.createEntry({
    ...fields,
    category: await ensureCategory(),
  });
}

const running = new Set<string>();

/**
 * Compile one target. Refused on a hand-edited target unless `replaceEdit`;
 * the result is dropped if the target was edited by hand while it compiled.
 */
export async function distill(
  targetId: string,
  replaceEdit = false,
): Promise<void> {
  if (running.has(targetId)) return;
  running.add(targetId);
  try {
    const startState = store.getState();
    const target = distillTargets(startState).find((t) => t.id === targetId);
    if (!target) return;
    const record = startState.distill.records[targetId];
    const before = await readCurrent(target, record);
    if (!replaceEdit && statusOf(target, record, before) === "hand-edited") {
      void api.v1.ui.toast(
        `${target.label} was edited by hand; Story Engine left it alone.`,
        {
          type: "info",
        },
      );
      return;
    }
    const sourceHash = hashText(target.sources);
    const compiled = await runGlm({
      id: api.v1.uuid(),
      label: `Distilling ${target.label}`,
      maxTokens: target.maxTokens,
      temperature: 0.4,
      messages: async () => ({
        messages: [
          { role: "system", content: DISTILL_PROMPT },
          {
            role: "user",
            content: `${target.sources}\n\n# WHAT TO WRITE\n${target.instruction}`,
          },
        ],
      }),
    });
    if (!compiled.trim()) return;
    const latest = store.getState();
    const after = await readCurrent(target, latest.distill.records[targetId]);
    if ((after ?? "") !== (before ?? "")) {
      void api.v1.ui.toast(
        `${target.label} changed while it compiled, so it was left as it is.`,
        {
          type: "info",
        },
      );
      return;
    }
    const text = finish(target, compiled, latest);
    const entryId = await write(
      target,
      text,
      latest.distill.records[targetId],
      latest,
    );
    store.dispatch(
      recordWritten({
        target: targetId,
        record: { entryId, sourceHash, writtenHash: hashText(text) },
      }),
    );
  } catch (error) {
    if (!(error instanceof Cancelled)) {
      void api.v1.ui.toast("Distilling failed.", { type: "error" });
      api.v1.log(`distill: ${String(error)}`);
    }
  } finally {
    running.delete(targetId);
  }
}

/** Compile every target that is stale or not compiled. Hand edits are skipped. */
export async function distillAll(): Promise<void> {
  const state = store.getState();
  const now = await statuses(state);
  const todo = distillTargets(state).filter(
    (t) => now[t.id] === "stale" || now[t.id] === "not compiled",
  );
  for (const target of todo) await distill(target.id);
}
