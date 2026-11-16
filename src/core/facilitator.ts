// The facilitator: GLM works the scenario out with the writer, then closes.
//
// Two calls a turn. First the seed (the Brief) is rewritten from the latest
// exchange, keeping everything already in it. Then the facilitator asks a
// round of multiple-choice questions about what the seed still needs. The
// options are where it shows it understands the premise and its genre, and an
// option the writer does not pick costs them nothing, where a single offer in
// prose had to be argued down. The code, not the model, decides what is still
// needed and when the seed is done.

import {
  store,
  messageAdded,
  messageUpdated,
  messageRemoved,
  briefUpdated,
  type Brief,
  type ChatMessage,
  type Question,
  type RootState,
} from "./store";
import { runGlm, Cancelled } from "./engine/glm";
import { ROUND_PROMPT, FACILITATOR_CLOSE, SEED_PROMPT } from "./prompts";
import { given } from "./text";
import { offerIfNone } from "./offers";

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
 * What the seed needs, in the order the rounds ask about it: the frame first
 * (how explicit, the voice, what the story dwells on, who and where), then
 * pace, limits and the rest. `min` is how long a section must be before it
 * counts as done: a one-line premise is a start, not a premise.
 */
export const INTERVIEW: ReadonlyArray<{
  field: keyof Brief;
  focus: string;
  min: number;
}> = [
  { field: "heat", focus: "how explicit it gets", min: 1 },
  { field: "voice", focus: "the narrative perspective and tense", min: 1 },
  {
    field: "desires",
    focus:
      "what the story should dwell on, concretely: the core of the genre for this writer, the dynamics they want",
    min: 120,
  },
  {
    field: "premise",
    focus:
      "the people and how they stand: who is here, what each feels about the others, where they live and how their days go",
    min: 300,
  },
  {
    field: "world",
    focus:
      "the world's frame: what kind of beings live in it and how sapient they are, its rules, what is ordinary there",
    min: 80,
  },
  { field: "pace", focus: "how quickly things escalate", min: 1 },
  {
    field: "limits",
    focus: "hard limits and soft limits",
    min: 1,
  },
  { field: "genre", focus: "the genre, and a few tags", min: 1 },
  { field: "title", focus: "a title", min: 1 },
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
 * Read a round: `LEAD:` is said to the writer, each question line takes the
 * `- option | meaning` lines under it. A question line is `### header |
 * question`, or (as GLM sometimes writes it) `HEADER: question?`; ending it
 * with `| any` allows several picks. `READING:` is the model thinking aloud
 * and is dropped. A question with fewer than two options is dropped.
 */
export function parseRound(text: string): {
  lead: string;
  questions: Question[];
} {
  let lead = "";
  const questions: Question[] = [];
  let current: Question | null = null;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || /^READING:/i.test(line) || isTemplate(line)) continue;
    const leadLine = line.match(/^LEAD:\s*(.*)$/i);
    const option = line.match(/^[-*•]\s*(.+)$/);
    const head = line.match(/^#{2,4}\s*(.+)$/);
    if (leadLine) lead = leadLine[1].trim();
    else if (option && current) {
      const { label, description } = splitOption(option[1]);
      if (label) current.options.push({ label, description });
    } else if (head || (!option && line.includes("?"))) {
      current = question(head ? head[1] : line);
      questions.push(current);
    }
  }
  return { lead, questions: questions.filter((q) => q.options.length >= 2) };
}

/**
 * An option line: "label | description". Without the bar, a short lead-in
 * before a colon is the label ("A slow burn: she grows over months"), so a
 * whole sentence never lands on the button as its title.
 */
export function splitOption(text: string): {
  label: string;
  description: string;
} {
  const [label, ...rest] = text.split("|").map((p) => p.trim());
  if (rest.length) return { label, description: rest.join(" ") };
  const colon = /^([^:]{2,60}):\s+(.+)$/.exec(label);
  return colon
    ? { label: colon[1].trim(), description: colon[2].trim() }
    : { label, description: "" };
}

/**
 * A line of the prompt's format copied back unfilled: "- <option> | <what it
 * means>". GLM sometimes echoes it before (or instead of) real lines.
 */
function isTemplate(line: string): boolean {
  const first = line
    .replace(/^[-*•#\s]+/, "")
    .split("|")[0]
    .trim();
  return /^<[^>]*>$/.test(first);
}

/** One question line: "header | question | any" or "HEADER: question?". */
function question(line: string): Question {
  const parts = line.split("|").map((p) => p.trim());
  const multi = parts.length > 1 && /^any\b/i.test(parts[parts.length - 1]);
  if (multi) parts.pop();
  if (parts.length > 1) {
    return {
      header: parts[0],
      question: parts.slice(1).join(" "),
      options: [],
      multi,
    };
  }
  const named = parts[0].match(/^([^:?]{1,40}):\s*(.+)$/);
  return {
    header: named ? named[1].trim() : parts[0],
    question: named ? named[2].trim() : parts[0],
    options: [],
    multi,
  };
}

/** The writer's picks on a round, as their answer: "Heat: Explicit graphic". */
export function answerText(message: ChatMessage | undefined): string {
  if (!message?.questions || !message.picks) return "";
  return message.questions
    .map((q, i) => {
      const picked = message.picks?.[i] ?? [];
      return picked.length ? `${q.header}: ${picked.join(", ")}` : "";
    })
    .filter(Boolean)
    .join("\n");
}

/** A message as the transcript shows it to GLM: a round lists its questions. */
function said(m: ChatMessage): string {
  if (!m.questions?.length) return m.content;
  const asked = m.questions
    .map((q) =>
      [
        `${q.header}: ${q.question}`,
        ...q.options.map((o) => `  - ${o.label}: ${o.description}`),
      ].join("\n"),
    )
    .join("\n");
  return `${m.content}\n${asked}`.trim();
}

function transcript(state: RootState): Message[] {
  return state.chat.messages
    .map((m) => ({ role: m.role, content: said(m) }))
    .filter((m) => m.content.trim())
    .slice(-HISTORY);
}

/** Rewrite the seed from the latest exchange. */
async function updateSeed(): Promise<void> {
  const text = await runGlm({
    id: api.v1.uuid(),
    label: "Reading your answer",
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

/** The facilitator's turn: a round of questions, or the close. */
async function reply(): Promise<void> {
  const replyId = api.v1.uuid();
  store.dispatch(messageAdded({ id: replyId, role: "assistant", content: "" }));
  try {
    if (interviewDone(store.getState().canon.brief)) {
      await close(replyId);
      // The seed is done: have the first vignettes waiting on their tab.
      offerIfNone();
    } else await round(replyId);
  } catch (error) {
    store.dispatch(messageRemoved({ id: replyId }));
    if (!(error instanceof Cancelled)) {
      void api.v1.ui.toast("The facilitator could not answer.", {
        type: "error",
      });
    }
  }
}

async function round(replyId: string): Promise<void> {
  const text = await runGlm({
    id: api.v1.uuid(),
    label: "Thinking of questions",
    maxTokens: 1200,
    temperature: 0.8,
    messages: async () => {
      const state = store.getState();
      const brief = state.canon.brief;
      // The first round always asks what the story dwells on: the seed fills
      // Desires from the opening's summary, which names the genre, not which
      // of its flavours the writer wants.
      const first = !state.chat.messages.some((m) => m.questions?.length);
      const needed = INTERVIEW.filter(
        (q) => !ready(q, brief) || (first && q.field === "desires"),
      )
        .map((q) => `- ${q.focus}`)
        .join("\n");
      const system = [
        ROUND_PROMPT,
        `THE SEED SO FAR:\n${formatBrief(brief)}`,
        `NEEDED:\n${needed}`,
      ].join("\n\n");
      // The writer always speaks first, so the transcript ends on their turn.
      return {
        messages: [{ role: "system", content: system }, ...transcript(state)],
      };
    },
  });
  const { lead, questions } = parseRound(text);
  if (questions.length) {
    store.dispatch(messageUpdated({ id: replyId, content: lead, questions }));
    return;
  }
  // No round could be read: show what was said, without the thinking.
  const plain = text
    .split("\n")
    .filter((l) => !/^READING:/i.test(l.trim()))
    .join("\n")
    .replace(/^LEAD:\s*/im, "")
    .trim();
  if (plain) store.dispatch(messageUpdated({ id: replyId, content: plain }));
  else store.dispatch(messageRemoved({ id: replyId }));
}

/** The close: the seed read back, no questions. */
async function close(replyId: string): Promise<void> {
  // The close is its own prompt: next to "ask questions", a "now ask nothing"
  // line lost and the model asked about a filled field.
  const text = await runGlm({
    id: replyId,
    label: "Reading the brief back",
    maxTokens: 400,
    temperature: 0.7,
    messages: async () => {
      const state = store.getState();
      const system = [
        FACILITATOR_CLOSE,
        `THE SEED:\n${formatBrief(state.canon.brief)}`,
      ].join("\n\n");
      return {
        messages: [{ role: "system", content: system }, ...transcript(state)],
      };
    },
  });
  const final = withoutQuestions(text);
  if (final) store.dispatch(messageUpdated({ id: replyId, content: final }));
  else store.dispatch(messageRemoved({ id: replyId }));
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
 * One turn: the writer's message (their picks on the last round and anything
 * they wrote) goes into the seed, then the facilitator asks the next round,
 * or closes once the seed is complete.
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
