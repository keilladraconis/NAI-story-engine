// GLM work on canon documents: the critic, Fix, and rewrite with an instruction.
// A rewrite only lands if the document still holds the text it started from;
// otherwise the writer's newer edit wins and the result is dropped.

import {
  store,
  docReviewed,
  docTextSet,
  type CanonDoc,
  type Issue,
  type IssueKind,
  type RootState,
} from "./store";
import { runGlm, Cancelled } from "./engine/glm";
import { CRITIC_PROMPT, REWRITE_PROMPT } from "./prompts";
import { formatBrief } from "./facilitator";
import { docHeading, fit } from "./workshop/frames";
import { hashText } from "./text";

/** Characters of canon a GLM call reads around the document it works on. */
const CONTEXT_BUDGET = 24000;

/** The canon around a document, for GLM: everything the critic checks against. */
export function canonContext(state: RootState, docId: string): string {
  const { canon } = state;
  const { now, notYet } = canon.startingPoint;
  const blocks = [
    `# Brief\n${formatBrief(canon.brief)}`,
    now.trim() || notYet.trim()
      ? `# Starting point\nNow:\n${now.trim()}\n\nNot yet:\n${notYet.trim()}`
      : "",
    ...canon.docs
      .filter((d) => d.id !== docId && d.text.trim())
      .map((d) => `# ${docHeading(d)}\n${d.text.trim()}`),
    canon.vignettes.length
      ? `# Tone samples (not events)\n${canon.vignettes.map((v) => v.text.trim()).join("\n\n")}`
      : "",
  ];
  return fit(blocks, CONTEXT_BUDGET);
}

const KINDS: readonly IssueKind[] = [
  "contradiction",
  "past-the-now",
  "invented",
  "name-collision",
  "missing-family",
  "limit",
];

/** Lowercase, one space, plain quotes: for finding a quote in a document. */
const plain = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Whether an issue is about the document under review: its first quote (the
 * words at fault) must be the document's own. The critic reads the whole
 * canon, and a problem it quoted from another document was filed on the
 * wrong one; that document's own review reports it. An issue without a quote
 * is kept.
 */
export function quotesDoc(issue: string, docText: string): boolean {
  const quote = /["\u201c]([^"\u201c\u201d]{4,})["\u201d]/.exec(issue)?.[1];
  if (!quote) return true;
  // An elided quote ("the first words... the last") is checked piece by piece.
  return quote
    .split(/\.\.\.|\u2026/)
    .map((piece) => plain(piece).replace(/^[\s,.;:]+|[\s,.;:]+$/g, ""))
    .filter((piece) => piece.length >= 4)
    .every((piece) => plain(docText).includes(piece));
}

/**
 * Parse `KIND | text` lines. Unknown kinds and `NONE` yield nothing; with the
 * document's text, so do issues quoting another document (`quotesDoc`).
 */
export function parseIssues(
  text: string,
  makeId: () => string,
  docText?: string,
): Issue[] {
  const issues: Issue[] = [];
  for (const line of text.split("\n")) {
    const at = line.indexOf("|");
    if (at === -1) continue;
    const kind = line
      .slice(0, at)
      .trim()
      .toLowerCase()
      .replace(/^[-*\s]+/, "") as IssueKind;
    const body = line.slice(at + 1).trim();
    // A body with no words (a lone quote mark from a broken line) is no issue.
    if (!KINDS.includes(kind) || !/[a-z]{3}/i.test(body)) continue;
    if (docText !== undefined && !quotesDoc(body, docText)) continue;
    issues.push({ id: makeId(), kind, text: body });
  }
  return issues;
}

/** Room for a rewritten document: its length in tokens plus slack, capped. */
export function rewriteTokens(text: string): number {
  return Math.min(2000, Math.ceil(text.length / 3) + 300);
}

const docOf = (docId: string): CanonDoc | undefined =>
  store.getState().canon.docs.find((d) => d.id === docId);

const busy = new Set<string>();

/** Run `work` once per document at a time; a second press while it runs is ignored. */
async function once(docId: string, work: () => Promise<void>): Promise<void> {
  if (busy.has(docId)) return;
  busy.add(docId);
  try {
    await work();
  } catch (error) {
    if (!(error instanceof Cancelled)) {
      void api.v1.ui.toast("Story Engine could not finish that.", {
        type: "error",
      });
      api.v1.log(`critic: ${String(error)}`);
    }
  } finally {
    busy.delete(docId);
  }
}

export function review(docId: string): Promise<void> {
  return once(docId, async () => {
    const doc = docOf(docId);
    if (!doc?.text.trim()) return;
    const textHash = hashText(doc.text);
    const reply = await runGlm({
      id: api.v1.uuid(),
      label: `Reviewing ${doc.title}`,
      maxTokens: 600,
      temperature: 0.3,
      messages: async () => ({
        messages: [
          { role: "system", content: CRITIC_PROMPT },
          {
            role: "user",
            content: `${canonContext(store.getState(), docId)}\n\n# DOCUMENT UNDER REVIEW: ${docHeading(doc)}\n${doc.text.trim()}`,
          },
        ],
      }),
    });
    const now = docOf(docId);
    // Edited while the critic read it: this review is of text that is gone.
    if (!now || hashText(now.text) !== textHash) return;
    store.dispatch(
      docReviewed({
        id: docId,
        review: {
          issues: parseIssues(reply, () => api.v1.uuid(), now.text),
          textHash,
        },
      }),
    );
  });
}

/** Review every document whose review is missing or older than its text. */
export async function reviewAll(): Promise<void> {
  const stale = store
    .getState()
    .canon.docs.filter(
      (d) => d.text.trim() && d.review?.textHash !== hashText(d.text),
    );
  for (const doc of stale) await review(doc.id);
}

async function rewrite(
  docId: string,
  label: string,
  ask: string,
): Promise<void> {
  const doc = docOf(docId);
  if (!doc?.text.trim()) return;
  const started = hashText(doc.text);
  const reply = await runGlm({
    id: api.v1.uuid(),
    label,
    maxTokens: rewriteTokens(doc.text),
    temperature: 0.5,
    messages: async () => ({
      messages: [
        { role: "system", content: REWRITE_PROMPT },
        {
          role: "user",
          content: `${canonContext(store.getState(), docId)}\n\n# THE DOCUMENT: ${docHeading(doc)}\n${doc.text.trim()}\n\n# WHAT TO CHANGE\n${ask}`,
        },
      ],
    }),
  });
  const now = docOf(docId);
  if (!now || hashText(now.text) !== started) {
    void api.v1.ui.toast(
      `${doc.title} changed while it was being rewritten, so the rewrite was dropped.`,
      { type: "info" },
    );
    return;
  }
  if (reply.trim())
    store.dispatch(docTextSet({ id: docId, text: reply.trim() }));
}

export function fix(docId: string, issue: Issue): Promise<void> {
  return once(docId, async () => {
    const doc = docOf(docId);
    if (!doc) return;
    await rewrite(
      docId,
      `Fixing ${doc.title}`,
      `Resolve this problem, everywhere it occurs in the document, and nothing else: ${issue.kind} | ${issue.text}`,
    );
    // The fixed text has no review yet; the critic runs again on demand.
  });
}

/** Resolve every open issue of a document in one rewrite. */
export function fixAll(docId: string): Promise<void> {
  return once(docId, async () => {
    const doc = docOf(docId);
    const issues = doc?.review?.issues ?? [];
    if (!doc || !issues.length) return;
    await rewrite(
      docId,
      `Fixing ${doc.title}`,
      `Resolve these problems, everywhere each occurs in the document, and nothing else:\n${issues.map((i) => `- ${i.kind} | ${i.text}`).join("\n")}`,
    );
  });
}

export function rewriteWith(docId: string, instruction: string): Promise<void> {
  const ask = instruction.trim();
  if (!ask) return Promise.resolve();
  return once(docId, async () => {
    const doc = docOf(docId);
    if (!doc) return;
    await rewrite(docId, `Rewriting ${doc.title}`, ask);
  });
}
