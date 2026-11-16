// GLM work on the script budget. Every call goes through one GenX queue so the
// header can show one state for all of it (queued, generating, waiting for
// budget, waiting for the writer). Callers await the text.
//
// The queue is created once at startup (`startGlm`) and held here: there is one
// script budget, so there is one queue.

import { GenX, type MessageFactory } from "nai-gen-x";
import { store, genxUpdated, jobQueued, jobFinished } from "../store";
import { recordEntry } from "./journal";
import { addTokens, appendStream, clearStream } from "./stream-buffer";
import { stripThinkingTags } from "../text";

export const GLM_MODEL = "glm-4-6";

let genX: GenX | null = null;

export function startGlm(): GenX {
  genX = new GenX({
    onStateChange: (state) => store.dispatch(genxUpdated(state)),
  });
  return genX;
}

export interface GlmJob {
  /** Unique per call; also the stream-buffer key while it streams. */
  id: string;
  /** Shown in status lines and the journal: "Reviewing Tam". */
  label: string;
  /** Built when the job reaches the front of the queue, so it reads the store then. */
  messages: MessageFactory;
  maxTokens: number;
  temperature?: number;
  stop?: string[];
}

/** Thrown when a job was cancelled; callers stop quietly on it. */
export class Cancelled extends Error {
  constructor() {
    super("Cancelled");
  }
}

export async function runGlm(job: GlmJob): Promise<string> {
  if (!genX) throw new Error("GLM queue not started");
  store.dispatch(
    jobQueued({ id: job.id, label: job.label, maxTokens: job.maxTokens }),
  );
  let sent: { role: string; content?: string }[] = [];
  const factory: MessageFactory = async () => {
    const built = await job.messages();
    sent = built.messages;
    return built;
  };
  const params = {
    model: GLM_MODEL,
    max_tokens: job.maxTokens,
    temperature: job.temperature ?? 1,
    stop: job.stop,
    taskId: job.id,
  };
  const signal = await api.v1.createCancellationSignal();
  try {
    // Every reply streams into the buffer under the job's id, with a count of
    // the tokens received, thinking included: the header's progress is that
    // count against the tokens requested.
    const response = await genX.generate(
      factory,
      params,
      (choices) => {
        const choice = choices[0];
        if (!choice) return;
        addTokens(job.id, choice.token_ids?.length || (choice.text ? 1 : 0));
        if (choice.text && !choice.isReasoning)
          appendStream(job.id, choice.text);
      },
      "background",
      signal,
    );
    const text = stripThinkingTags(response.choices[0]?.text ?? "").trim();
    recordEntry({
      label: job.label,
      timestamp: Date.now(),
      messages: sent,
      params,
      response: text,
      success: true,
    });
    return text;
  } catch (error) {
    recordEntry({
      label: job.label,
      timestamp: Date.now(),
      messages: sent,
      params,
      response: String(error),
      success: false,
    });
    if (signal.cancelled || error === "Cancelled") throw new Cancelled();
    throw error;
  } finally {
    signal.dispose();
    clearStream(job.id);
    store.dispatch(jobFinished({ id: job.id }));
  }
}

/** Cancel every queued and running GLM job. */
export function cancelGlm(): void {
  genX?.cancelAll();
}

/** The writer is here: let a job parked on `waiting_for_user` continue. */
export function confirmPresence(): void {
  genX?.userInteraction();
}
