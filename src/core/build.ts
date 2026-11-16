// Building the canon hands-off. GLM plans the documents this scenario needs
// (the writer picks which to build); then each empty one is drafted on the
// page by the story model, saved, and the next begins, in the Canon stage's
// order so later documents read the earlier ones in their frame. The critic
// reviews them all at the end; the writer reads, fixes and edits after.

import {
  store,
  planSet,
  buildProgressed,
  type CanonDoc,
  type DocKind,
  type PlanItem,
} from "./store";
import { runGlm, Cancelled } from "./engine/glm";
import { PLAN_PROMPT } from "./prompts";
import { formatBrief } from "./facilitator";
import { addDoc } from "./canon";
import { reviewAll } from "./critic";
import { KINDS, KIND_ORDER } from "./workshop/targets";
import { saveDraft, stopWriting, writeDraft } from "./workshop/workshop";
import { draftText } from "./workshop/page";

/** The plan call's job label; the Canon stage shows it while it runs. */
export const PLAN_LABEL = "Planning the canon";

/** Kinds titled by the writer (a name), not by the kind. */
const NAMED: readonly DocKind[] = ["dossier", "system"];

/** Read `- kind | title | why` lines; unknown kinds and repeats are dropped. */
export function parsePlan(text: string): PlanItem[] {
  const items: PlanItem[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim().replace(/^[-*•]\s*/, "");
    const [kindText, title = "", ...rest] = line
      .split("|")
      .map((p) => p.trim());
    const kind = kindText?.toLowerCase() as DocKind;
    if (!line || !KIND_ORDER.includes(kind) || /^<.*>$/.test(title)) continue;
    // GLM sometimes lists a kind only to say it does not apply.
    if (/\bnot (applicable|needed|relevant)\b|\bn\/a\b/i.test(rest.join(" ")))
      continue;
    const named = NAMED.includes(kind);
    if (named && !title) continue;
    const item: PlanItem = {
      kind,
      title: named ? title : KINDS[kind].heading,
      why: rest.join(" "),
      picked: true,
    };
    if (!items.some((i) => planKey(i) === planKey(item))) items.push(item);
  }
  return items;
}

/** One document per kind, except named kinds: one per name. */
function planKey(item: { kind: DocKind; title: string }): string {
  return NAMED.includes(item.kind)
    ? `${item.kind}:${item.title.trim().toLowerCase()}`
    : item.kind;
}

/** The existing document a planned one would be, if there is one. */
function existing(item: PlanItem): CanonDoc | undefined {
  return store.getState().canon.docs.find((d) => planKey(d) === planKey(item));
}

let planning = false;

/** Ask GLM which documents this scenario needs, following the writer's steer. */
export async function planCanon(steer = ""): Promise<void> {
  if (planning) return;
  planning = true;
  try {
    const text = await runGlm({
      id: api.v1.uuid(),
      label: PLAN_LABEL,
      maxTokens: 700,
      temperature: 0.4,
      messages: async () => {
        const { canon } = store.getState();
        const written = canon.docs
          .filter((d) => d.text.trim())
          .map((d) => `- ${d.kind} | ${d.title}`)
          .join("\n");
        const user = [
          `THE SEED:\n${formatBrief(canon.brief)}`,
          canon.startingPoint.now.trim() &&
            `THE STARTING POINT:\nNow:\n${canon.startingPoint.now.trim()}\nNot yet:\n${canon.startingPoint.notYet.trim()}`,
          canon.vignettes.length &&
            `THE VIGNETTES:\n${canon.vignettes.map((v) => `## ${v.title}\n${v.text.trim().slice(0, 1200)}`).join("\n\n")}`,
          `ALREADY WRITTEN:\n${written || "Nothing yet."}`,
          steer.trim() && `THE WRITER'S STEER:\n${steer.trim()}`,
        ]
          .filter(Boolean)
          .join("\n\n");
        return {
          messages: [
            { role: "system", content: PLAN_PROMPT },
            { role: "user", content: user },
          ],
        };
      },
    });
    // A document already written is not planned again, whatever GLM says.
    const items = parsePlan(text).filter((i) => !existing(i)?.text.trim());
    store.dispatch(planSet({ items }));
    if (!items.length) {
      void api.v1.ui.toast("Nothing more to plan; every document is written.", {
        type: "info",
      });
    }
  } catch (error) {
    if (!(error instanceof Cancelled)) {
      void api.v1.ui.toast("Could not plan the canon.", { type: "error" });
    }
  } finally {
    planning = false;
  }
}

let stopping = false;

/** Stop the build after the document under way (and stop its drafting). */
export function stopBuild(): void {
  stopping = true;
  stopWriting();
}

const progress = (
  p: Partial<{ done: number; total: number; current: string }>,
) =>
  store.dispatch(
    buildProgressed({ ...store.getState().runtime.build, ...p, running: true }),
  );

/**
 * Draft every picked document that is still empty, one after another, saving
 * each; then review them all. Stops when the writer stops it or takes over a
 * Send (the draft they took over stays on the page, unsaved).
 */
export async function buildCanon(): Promise<void> {
  const state = store.getState();
  if (state.runtime.build.running) return;
  // The page must be free: an unsaved draft of something else is the
  // writer's work, and a build would have to throw it away.
  if (state.workshop.on && (await draftText())) {
    void api.v1.ui.toast("Save or clear the draft first.", { type: "info" });
    return;
  }
  // Create the picked documents that do not exist yet, then build every empty
  // one in the stage's order.
  for (const item of state.runtime.plan) {
    if (item.picked && !existing(item)) addDoc(item.kind, item.title);
  }
  const wanted = new Set(
    state.runtime.plan.filter((i) => i.picked).map(planKey),
  );
  const queue = [...store.getState().canon.docs]
    .filter((d) => wanted.has(planKey(d)) && !d.text.trim())
    .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind))
    .map((d) => d.id);
  if (!queue.length) return;

  stopping = false;
  store.dispatch(
    buildProgressed({
      running: true,
      done: 0,
      total: queue.length,
      current: "",
    }),
  );
  let finished = true;
  try {
    for (const [i, docId] of queue.entries()) {
      const doc = store.getState().canon.docs.find((d) => d.id === docId);
      if (!doc) continue; // deleted while the build ran
      if (stopping) {
        finished = false;
        break;
      }
      progress({ done: i, current: doc.title });
      const written = await writeDraft({ kind: "doc", docId }, "", true);
      if (!written || stopping) {
        finished = false;
        break;
      }
      await saveDraft();
    }
    if (finished) {
      store.dispatch(planSet({ items: [] }));
      progress({ done: queue.length, current: "" });
      await reviewAll();
    }
  } finally {
    store.dispatch(
      buildProgressed({ running: false, done: 0, total: 0, current: "" }),
    );
  }
}
