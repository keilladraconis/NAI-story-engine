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
];

export function formatBrief(brief: Brief): string {
  return BRIEF_LINES.map(
    ([key, label]) => `${label}: ${brief[key].trim()}`,
  ).join("\n");
}

/** The next field the interview asks about, or null when the brief is complete. */
export function nextField(brief: Brief): (typeof INTERVIEW)[number] | null {
  return INTERVIEW.find((q) => !brief[q.field].trim()) ?? null;
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

/** Keep a reply to its first question: one question a turn. */
export function oneQuestion(text: string): string {
  const at = text.indexOf("?");
  return at === -1 ? text.trim() : text.slice(0, at + 1).trim();
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
  const asked =
    [...state.chat.messages].reverse().find((m) => m.role === "assistant")
      ?.content ?? "";
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
          content: `THE BRIEF:\n${formatBrief(store.getState().canon.brief)}\n\nTHE FACILITATOR ASKED:\n${asked || "(nothing yet)"}\n\nTHE WRITER ANSWERED:\n${answer}`,
        },
      ],
    }),
  });
  const patch = mergeBrief(store.getState().canon.brief, parseBrief(text));
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
        const history = transcript(state);
        // A first turn has no transcript; the model still needs a user turn.
        return {
          messages: [
            { role: "system", content: system },
            ...(history.length
              ? history
              : [{ role: "user" as const, content: "Start." }]),
          ],
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
 * One turn: the writer's answer is read into the Brief, then the facilitator
 * asks about the next empty field, or closes once there is none. With no text
 * and an empty transcript, it opens the interview.
 */
export async function talk(text: string): Promise<void> {
  const said = text.trim();
  const fresh = !store.getState().chat.messages.length;
  if (talking || (!said && !fresh)) return;
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
