// The facilitator chat: GLM interviews the writer in the Brief and Cast stages.
// It never writes canon. "Update brief" reads the conversation into the Brief.

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
  FACILITATOR_CAST_NOTE,
  BRIEF_EXTRACTION_PROMPT,
} from "./prompts";

/** Turns of transcript a facilitator call reads. */
const HISTORY = 24;

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

export function formatBrief(brief: Brief): string {
  return BRIEF_LINES.map(
    ([key, label]) => `${label}: ${brief[key].trim()}`,
  ).join("\n");
}

function scenarioSoFar(state: RootState): string {
  const { canon } = state;
  const cast = canon.docs
    .filter((d) => d.kind === "dossier")
    .map((d) => d.title);
  return [
    "The brief as it stands:",
    formatBrief(canon.brief),
    canon.vignettes.length
      ? `Kept vignettes: ${canon.vignettes.map((v) => v.title).join("; ")}`
      : "",
    cast.length ? `Cast: ${cast.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function transcript(state: RootState): Message[] {
  return state.chat.messages
    .filter((m) => m.content.trim())
    .slice(-HISTORY)
    .map((m) => ({ role: m.role, content: m.content }));
}

let talking = false;

/** One facilitator turn: the writer's message, then GLM's reply streamed in. */
export async function talk(
  text: string,
  stage: "brief" | "cast",
): Promise<void> {
  const said = text.trim();
  if (!said || talking) return;
  talking = true;
  store.dispatch(
    messageAdded({ id: api.v1.uuid(), role: "user", content: said }),
  );
  const replyId = api.v1.uuid();
  store.dispatch(messageAdded({ id: replyId, role: "assistant", content: "" }));
  try {
    const reply = await runGlm({
      id: replyId,
      label: "Facilitator",
      maxTokens: 400,
      temperature: 0.8,
      stream: true,
      messages: async () => {
        const state = store.getState();
        const system = [
          FACILITATOR_PROMPT,
          stage === "cast" ? FACILITATOR_CAST_NOTE : "",
          scenarioSoFar(state),
        ]
          .filter(Boolean)
          .join("\n\n");
        // The placeholder is empty, so the transcript ends on the writer's turn.
        return {
          messages: [{ role: "system", content: system }, ...transcript(state)],
        };
      },
    });
    if (reply) store.dispatch(messageUpdated({ id: replyId, content: reply }));
    else store.dispatch(messageRemoved({ id: replyId }));
  } catch (error) {
    store.dispatch(messageRemoved({ id: replyId }));
    if (!(error instanceof Cancelled)) {
      void api.v1.ui.toast("The facilitator could not answer.", {
        type: "error",
      });
    }
  } finally {
    talking = false;
  }
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
 * Which proposed values to write: every empty field the proposal fills, and
 * notes the brief does not already hold. A field the writer filled is never
 * overwritten; they edit it themselves.
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
    } else if (!current[key].trim()) {
      patch[key] = value;
    }
  }
  return patch;
}

let updating = false;

export async function updateBrief(): Promise<void> {
  if (updating) return;
  if (!store.getState().chat.messages.length) {
    void api.v1.ui.toast("Talk to the facilitator first.", { type: "info" });
    return;
  }
  updating = true;
  try {
    const text = await runGlm({
      id: api.v1.uuid(),
      label: "Updating the brief",
      maxTokens: 500,
      temperature: 0.3,
      messages: async () => {
        const state = store.getState();
        const conversation = transcript(state)
          .map(
            (m) =>
              `${m.role === "user" ? "WRITER" : "FACILITATOR"}: ${m.content}`,
          )
          .join("\n\n");
        return {
          messages: [
            { role: "system", content: BRIEF_EXTRACTION_PROMPT },
            {
              role: "user",
              content: `The brief as it stands:\n${formatBrief(state.canon.brief)}\n\nThe conversation:\n${conversation}`,
            },
          ],
        };
      },
    });
    const patch = mergeBrief(store.getState().canon.brief, parseBrief(text));
    const filled = Object.keys(patch);
    if (filled.length) store.dispatch(briefUpdated(patch));
    void api.v1.ui.toast(
      filled.length
        ? `Brief updated: ${filled.join(", ")}.`
        : "Nothing new for the brief. Fields you filled are left as they are.",
      { type: "info" },
    );
  } catch (error) {
    if (!(error instanceof Cancelled)) {
      void api.v1.ui.toast("The brief could not be updated.", {
        type: "error",
      });
    }
  } finally {
    updating = false;
  }
}
