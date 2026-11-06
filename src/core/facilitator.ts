// The facilitator: GLM works the scenario out with the writer, then closes.
//
// Two calls a turn. First the seed (the Brief) is rewritten from the latest
// exchange, keeping everything already in it, so even a five-word start grows
// into a premise, desires and a world. Then the facilitator replies: one
// concrete offer and one question about the thinnest part of the seed. The
// code, not the model, decides which part that is and when the seed is done.

import {
  store,
  messageAdded,
  messageUpdated,
  messageRemoved,
  briefUpdated,
  type Brief,
  type RootState,
} from "./store";
import { runGlm, Cancelled } from "./engine/glm";
import { FACILITATOR_PROMPT, FACILITATOR_CLOSE, SEED_PROMPT } from "./prompts";
import { given } from "./text";

/** Turns of transcript a facilitator call reads. */
const HISTORY = 16;

const SEED_SECTIONS: ReadonlyArray<readonly [keyof Brief, string]> = [
  ["title", "TITLE"],
  ["genre", "GENRE"],
  ["premise", "PREMISE"],
  ["desires", "DESIRES"],
  ["world", "WORLD"],
  ["voice", "VOICE"],
  ["heat", "HEAT"],
  ["pace", "PACE"],
  ["limits", "LIMITS"],
  ["notes", "NOTES"],
];

/**
 * What the conversation works on, in order: the substance first, the quick
 * settings after. `min` is how long a section must be before the talk moves
 * on: a one-line premise is a start, not a premise.
 */
export const INTERVIEW: ReadonlyArray<{
  field: keyof Brief;
  focus: string;
  min: number;
}> = [
  {
    field: "premise",
    focus:
      "the premise: who the story is about (names, ages, situations), where, and the pressure it lives inside",
    min: 300,
  },
  {
    field: "desires",
    focus:
      "what the story should dwell on: the core focus, the dynamics between people, the scenes the world must allow",
    min: 120,
  },
  {
    field: "world",
    focus:
      "the world: its rules, its tone, what kind of beings live in it, what is ordinary there",
    min: 80,
  },
  { field: "genre", focus: "the genre, and a few tags", min: 1 },
  { field: "voice", focus: "the narrative perspective and tense", min: 1 },
  {
    field: "heat",
    focus: "how explicit it gets, from tender to explicit on the page",
    min: 1,
  },
  { field: "pace", focus: "how quickly things escalate", min: 1 },
  {
    field: "limits",
    focus: "hard and soft limits: what the story must never do, or none",
    min: 1,
  },
  {
    field: "title",
    focus: "a title; suggest three short titles drawn from the premise",
    min: 1,
  },
];

export function formatBrief(brief: Brief): string {
  return SEED_SECTIONS.map(
    ([key, label]) => `## ${label}\n${brief[key].trim()}`,
  ).join("\n\n");
}

/** Read `## LABEL` sections into Brief fields; unknown headings are ignored. */
export function parseSeed(text: string): Partial<Brief> {
  const out: Partial<Brief> = {};
  let field: keyof Brief | null = null;
  let lines: string[] = [];
  const flush = () => {
    if (field) out[field] = lines.join("\n").trim();
  };
  for (const line of text.split("\n")) {
    const heading = line.match(/^\s*#{1,3}\s*([A-Z]+)\s*:?\s*$/);
    if (heading) {
      flush();
      field =
        SEED_SECTIONS.find(([, label]) => label === heading[1])?.[0] ?? null;
      lines = [];
    } else if (field) lines.push(line);
  }
  flush();
  return out;
}

/**
 * Does a field hold a real answer? "Unspecified" never does; "None" does for
 * limits only, where it is a real answer.
 */
export function answered(field: keyof Brief, value: string): boolean {
  if (given(value)) return true;
  return field === "limits" && /^none\.?$/i.test(value.trim());
}

/** Is a section developed enough for the talk to move on? */
function ready(q: (typeof INTERVIEW)[number], brief: Brief): boolean {
  const value = brief[q.field];
  return answered(q.field, value) && value.trim().length >= q.min;
}

/** What the talk works on next, or null when the seed is complete. */
export function nextField(brief: Brief): (typeof INTERVIEW)[number] | null {
  return INTERVIEW.find((q) => !ready(q, brief)) ?? null;
}

export function interviewDone(brief: Brief): boolean {
  return nextField(brief) === null;
}

/** The seed sections still unanswered, as their names: "voice", "title". */
export function missingBrief(brief: Brief): string[] {
  return INTERVIEW.filter((q) => !answered(q.field, brief[q.field])).map(
    (q) => q.field,
  );
}

/**
 * What a rewritten seed changes: a section with real text replaces the old
 * one; an empty or placeholder section never erases what is there. "None" is
 * taken for limits only.
 */
export function mergeBrief(
  current: Brief,
  proposed: Partial<Brief>,
): Partial<Brief> {
  const patch: Partial<Brief> = {};
  for (const [key] of SEED_SECTIONS) {
    const value = proposed[key];
    if (value === undefined || !answered(key, value)) continue;
    if (value !== current[key]) patch[key] = value;
  }
  return patch;
}

/** A closing reply asks nothing: drop any sentence that ends in a question. */
export function withoutQuestions(text: string): string {
  return text
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => !sentence.trim().endsWith("?"))
    .join(" ")
    .trim();
}

/**
 * One question a turn: keep the last question and drop any earlier ones. The
 * model sometimes turns its acknowledgement into a question ("So the story is
 * about…?"), and keeping the first left the writer confirming instead of
 * answering the real question.
 */
export function oneQuestion(text: string): string {
  const sentences = text.trim().split(/(?<=[.!?])\s+/);
  const last = sentences.map((s) => s.trim().endsWith("?")).lastIndexOf(true);
  if (last === -1) return text.trim();
  return sentences
    .slice(0, last + 1)
    .filter((s, i) => i === last || !s.trim().endsWith("?"))
    .join(" ")
    .trim();
}

function transcript(state: RootState): Message[] {
  return state.chat.messages
    .filter((m) => m.content.trim())
    .slice(-HISTORY)
    .map((m) => ({ role: m.role, content: m.content }));
}

/** Rewrite the seed from the latest exchange. */
async function updateSeed(): Promise<void> {
  const text = await runGlm({
    id: api.v1.uuid(),
    label: "Updating the seed",
    maxTokens: 1500,
    temperature: 0.3,
    messages: async () => {
      const state = store.getState();
      const talk = transcript(state)
        .slice(-4)
        .map(
          (m) =>
            `${m.role === "user" ? "WRITER" : "COLLABORATOR"}: ${m.content}`,
        )
        .join("\n\n");
      return {
        messages: [
          { role: "system", content: SEED_PROMPT },
          {
            role: "user",
            content: `THE SEED AS IT STANDS:\n${formatBrief(state.canon.brief)}\n\nTHE LATEST EXCHANGE:\n${talk}`,
          },
        ],
      };
    },
  });
  const patch = mergeBrief(store.getState().canon.brief, parseSeed(text));
  if (Object.keys(patch).length) store.dispatch(briefUpdated(patch));
}

async function reply(): Promise<void> {
  const replyId = api.v1.uuid();
  store.dispatch(messageAdded({ id: replyId, role: "assistant", content: "" }));
  try {
    const text = await runGlm({
      id: replyId,
      label: "Facilitator",
      maxTokens: 350,
      temperature: 0.8,
      stream: true,
      messages: async () => {
        const state = store.getState();
        const next = nextField(state.canon.brief);
        const seed = `THE SEED SO FAR:\n${formatBrief(state.canon.brief)}`;
        // The close is its own prompt: next to "ask one question", a "now ask
        // nothing" line lost and the model asked about a filled field.
        const system = next
          ? [FACILITATOR_PROMPT, seed, `FOCUS: ${next.focus}.`].join("\n\n")
          : [FACILITATOR_CLOSE, seed].join("\n\n");
        // The writer always speaks first, so the transcript ends on their turn.
        return {
          messages: [{ role: "system", content: system }, ...transcript(state)],
        };
      },
    });
    const done = interviewDone(store.getState().canon.brief);
    const final = done ? withoutQuestions(text) : oneQuestion(text);
    if (final) store.dispatch(messageUpdated({ id: replyId, content: final }));
    else store.dispatch(messageRemoved({ id: replyId }));
  } catch (error) {
    store.dispatch(messageRemoved({ id: replyId }));
    if (!(error instanceof Cancelled)) {
      void api.v1.ui.toast("The facilitator could not answer.", {
        type: "error",
      });
    }
  }
}

let talking = false;

async function turn(work: () => Promise<void>): Promise<void> {
  if (talking) return;
  talking = true;
  try {
    await work();
  } catch (error) {
    if (!(error instanceof Cancelled)) {
      void api.v1.ui.toast("The facilitator could not read that.", {
        type: "error",
      });
    }
  } finally {
    talking = false;
  }
}

/**
 * One turn: the writer's message goes into the seed, then the facilitator
 * replies about the thinnest part of it, or closes once the seed is complete.
 */
export function talk(text: string): Promise<void> {
  const said = text.trim();
  if (!said) return Promise.resolve();
  return turn(async () => {
    store.dispatch(
      messageAdded({ id: api.v1.uuid(), role: "user", content: said }),
    );
    await updateSeed();
    await reply();
  });
}
