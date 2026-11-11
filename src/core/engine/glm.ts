// GLM work on the script budget. Every call goes through one GenX queue so the
// header can show one state for all of it (queued, generating, waiting for
// budget, waiting for the writer). Callers await the text.
//
// The queue is created once at startup (`startGlm`) and held here: there is one
// script budget, so there is one queue.

import { GenX, type MessageFactory } from "nai-gen-x";
import {
  store,
  genxUpdated,
  jobQueued,
  jobStarted,
  jobFinished,
} from "../store";
import { recordEntry } from "./journal";
import { appendStream, clearStream, readStream } from "./stream-buffer";
import { stripThinkingTags } from "../text";

export const GLM_MODEL = "glm-4-6";

let genX: GenX | null = null;

export function startGlm(): GenX {
  genX = new GenX({
    onStateChange: (state) => store.dispatch(genxUpdated(state)),
  });
  // The oldest job's clock starts when the model starts on it: after any wait
  // for budget or for the writer, which is not progress. One job can follow
  // another with the status staying "generating", so watch both.
  store.subscribeSelector(
    (s) =>
      s.runtime.genx.status === "generating"
        ? (s.runtime.jobs[0]?.id ?? "")
        : "",
    (id) => {
      const job = store.getState().runtime.jobs[0];
      if (id && job?.id === id && !job.startedAt)
        store.dispatch(jobStarted({ id, at: Date.now() }));
    },
  );
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

// How long each kind of job took last time, and how long its reply ran, by
// label, for the header's progress figure. A first run is guessed from its
// token cap. GLM thinks before it answers and the answer comes in a burst, so
// time is the measure that moves; characters only ever push it on.
const last = new Map<string, { ms: number; chars: number }>();

function expected(label: string, maxTokens: number) {
  return last.get(label) ?? { ms: maxTokens * 25, chars: maxTokens * 2.5 };
}
export async function runGlm(job: GlmJob): Promise<string> {
  if (!genX) throw new Error("GLM queue not started");
  const guess = expected(job.label, job.maxTokens);
  store.dispatch(
    jobQueued({
      id: job.id,
      label: job.label,
      expectMs: guess.ms,
      expectChars: guess.chars,
      startedAt: 0,
    }),
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
    // Every reply streams into the buffer under the job's id: the header
    // measures progress from it, and a streaming bubble reads it.
    const response = await genX.generate(
      factory,
      params,
      (choices) => {
        const chunk = choices[0]?.text;
        if (chunk) appendStream(job.id, chunk);
      },
      "background",
      signal,
    );
    const chars = readStream(job.id)?.length ?? 0;
    const startedAt =
      store.getState().runtime.jobs.find((j) => j.id === job.id)?.startedAt ??
      0;
    if (startedAt && chars)
      last.set(job.label, { ms: Date.now() - startedAt, chars });
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
