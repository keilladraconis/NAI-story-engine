// The facilitator: GLM interviews the writer to fill the Brief, one question at
// a time, then closes. Each answer is read into the Brief at once, so the
// interview always knows which field is next, and the code (not the model)
// decides when it is over.

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
import {
  FACILITATOR_PROMPT,
  FACILITATOR_CLOSE,
  BRIEF_EXTRACTION_PROMPT,
} from "./prompts";
import { given } from "./text";

/** Turns of transcript a facilitator call reads. */
const HISTORY = 12;

const BRIEF_LINES: ReadonlyArray<readonly [keyof Brief, string]> = [
  ["title", "TITLE"],
  ["genre", "GENRE"],
  ["premise", "PREMISE"],
  ["voice", "VOICE"],
  ["heat", "HEAT"],
  ["pace", "PACE"],
  ["limits", "LIMITS"],
  ["notes", "NOTES"],
];

/** The interview, in order: each field and what to ask about. */
export const INTERVIEW: ReadonlyArray<{ field: keyof Brief; ask: string }> = [
  {
    field: "premise",
    ask: "who the story is about, where it is set, and the pressure it lives inside",
  },
  { field: "voice", ask: "the narrative perspective and tense" },
  { field: "genre", ask: "the genre, and a few tags" },
  {
    field: "heat",
    ask: "how explicit it gets, from tender to explicit on the page",
  },
  { field: "pace", ask: "how quickly things escalate" },
  {
    field: "limits",
    ask: "hard and soft limits: what the story must never do, or none",
  },
  {
    field: "title",
    ask: "a title; suggest three short titles drawn from the premise",
  },
];

/**
 * Does a field hold a real answer? "Unspecified" never does; "None" does for
 * limits only, where it is a real answer.
 */
export function answered(field: keyof Brief, value: string): boolean {
  if (given(value)) return true;
  return field === "limits" && /^none\.?$/i.test(value.trim());
}

/**
 * Keep what an answer may set: a real value for any field, and a "None" or
 * "Unspecified" only for the field that was just asked about (a writer can
 * decline a question, never one they were not asked).
 */
export function acceptAnswer(
  proposed: Partial<Brief>,
  asked: keyof Brief | null,
): Partial<Brief> {
  const out: Partial<Brief> = {};
  for (const [key, value] of Object.entries(proposed) as [
    keyof Brief,
    string,
  ][]) {
    if (given(value) || key === asked) out[key] = value;
  }
  return out;
}

export function formatBrief(brief: Brief): string {
  return BRIEF_LINES.map(
    ([key, label]) => `${label}: ${brief[key].trim()}`,
  ).join("\n");
}

/** The next field the interview asks about, or null when the brief is complete. */
export function nextField(brief: Brief): (typeof INTERVIEW)[number] | null {
  return INTERVIEW.find((q) => !answered(q.field, brief[q.field])) ?? null;
}

/** The Brief fields still unanswered, as their names: "voice", "title". */
export function missingBrief(brief: Brief): string[] {
  return INTERVIEW.filter((q) => !answered(q.field, brief[q.field])).map(
    (q) => q.field,
  );
}

export function interviewDone(brief: Brief): boolean {
  return nextField(brief) === null;
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

/** Parse `LABEL: value` lines into Brief fields; unknown lines are ignored. */
export function parseBrief(text: string): Partial<Brief> {
  const out: Partial<Brief> = {};
  for (const line of text.split("\n")) {
    const match = line.match(/^\s*([A-Z]+)\s*:\s*(.*)$/);
    if (!match) continue;
    const field = BRIEF_LINES.find(([, label]) => label === match[1]);
    if (field && match[2].trim()) out[field[0]] = match[2].trim();
  }
  return out;
}

/**
 * What an answer changes: the fields it names, replaced, since the writer's
 * latest word wins; notes appended when the brief does not already hold them.
 */
export function mergeBrief(
  current: Brief,
  proposed: Partial<Brief>,
): Partial<Brief> {
  const patch: Partial<Brief> = {};
  for (const [key] of BRIEF_LINES) {
    const value = proposed[key];
    if (!value) continue;
    if (key === "notes") {
      const have = current.notes.trim();
      const fresh = value
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s && !have.toLowerCase().includes(s.toLowerCase()));
      if (fresh.length)
        patch.notes = [have, fresh.join("; ")].filter(Boolean).join("; ");
    } else if (value !== current[key]) {
      patch[key] = value;
    }
  }
  return patch;
}

/** Read the writer's latest answer into the Brief. */
async function readAnswer(answer: string): Promise<void> {
  const state = store.getState();
  const question =
    [...state.chat.messages].reverse().find((m) => m.role === "assistant")
      ?.content ?? "";
  // The field the question was about; none when the writer is opening.
  const askedField = question
    ? (nextField(state.canon.brief)?.field ?? null)
    : null;
  const text = await runGlm({
    id: api.v1.uuid(),
    label: "Reading your answer",
    maxTokens: 300,
    temperature: 0.2,
    messages: async () => ({
      messages: [
        { role: "system", content: BRIEF_EXTRACTION_PROMPT },
        {
          role: "user",
          content: `THE BRIEF:\n${formatBrief(store.getState().canon.brief)}\n\nTHE FACILITATOR ASKED:\n${question || "(nothing yet)"}\n\nTHE WRITER ANSWERED:\n${answer}`,
        },
      ],
    }),
  });
  const patch = mergeBrief(
    store.getState().canon.brief,
    acceptAnswer(parseBrief(text), askedField),
  );
  if (Object.keys(patch).length) store.dispatch(briefUpdated(patch));
}

async function reply(): Promise<void> {
  const replyId = api.v1.uuid();
  store.dispatch(messageAdded({ id: replyId, role: "assistant", content: "" }));
  try {
    const text = await runGlm({
      id: replyId,
      label: "Facilitator",
      maxTokens: 250,
      temperature: 0.7,
      stream: true,
      messages: async () => {
        const state = store.getState();
        const next = nextField(state.canon.brief);
        const brief = `THE BRIEF SO FAR:\n${formatBrief(state.canon.brief)}`;
        // The close is its own prompt: next to "ask exactly one question", a
        // "now ask nothing" line lost and the model asked about a filled field.
        const system = next
          ? [FACILITATOR_PROMPT, brief, `NEXT: ask about ${next.ask}.`].join(
              "\n\n",
            )
          : [FACILITATOR_CLOSE, brief].join("\n\n");
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

/**
 * One turn: the writer's message is read into the Brief, then the facilitator
 * asks about the next empty field, or closes once there is none. The writer
 * opens the interview by describing the scenario.
 */
export async function talk(text: string): Promise<void> {
  const said = text.trim();
  if (talking || !said) return;
  talking = true;
  try {
    if (said) {
      store.dispatch(
        messageAdded({ id: api.v1.uuid(), role: "user", content: said }),
      );
      await readAnswer(said);
    }
    await reply();
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
