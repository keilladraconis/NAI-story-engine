// The drain: the one place that branches on `intent.kind`.
//
// The pass reserves the triage call before spending it and then hands whatever
// triage produced to `drain`. Everything an intent does to the writer's story
// happens below this line, and every lorebook write goes through
// `lorebook-write.ts` — a path that skipped the door would skip the §5.2
// snapshot, which is the one promise made to a writer whose lorebook is being
// edited by a machine.
//
// Phase 6, Task 2 executes RETIRE and nothing else, deliberately: §3.3 prices it
// at zero output tokens, so the skeleton — the branch, the budget policy, the
// queue write-back — is provable end to end before Tasks 3–5 introduce actions
// that cost 1024. The other three arms log exactly what phase 4 logged.
//
// The switch has no `default`, and `INTENT_MAX_TOKENS` is a `Record` over the
// union's `kind`. A fifth intent is therefore two compile errors — a missing arm
// and a missing price — rather than an action that silently costs nothing and
// silently does nothing. `intentKey` in intents.ts is the house precedent.

import type { AppDispatch, RootState } from "../store/types";
import type { Intent } from "./loop-machine";
import { intentKey } from "./intents";
import { writeLorebookEntry } from "./lorebook-write";
import { threadStatusSet } from "../store/slices/world";
import { TRIAGE_MAX_TOKENS } from "./triage-strategy";

/** What the pass hands the drain.
 *
 *  `nodeId` is the node captured at the START of the pass (§6.3) and is passed
 *  through to every write, the same way the pass passes it to `saveRecords`.
 *  Triage takes seconds, the writer keeps typing, and a write without an
 *  explicit node has been measured landing two nodes away.
 *
 *  `log` is the pass's own `story_engine_debug`-gated logger, injected rather
 *  than reached for: the HUD is the always-on surface and the log is opt-in, so
 *  the drain must not acquire a second opinion about whether to speak. */
export type DrainDeps = {
  dispatch: AppDispatch;
  getState: () => RootState;
  nodeId: number;
  log: (...messages: unknown[]) => Promise<void>;
};

/** What the drain did and what it could not pay for.
 *
 *  `remaining` is what the budget could not afford, and it is the ONLY thing the
 *  caller writes back to the queue record. §3.3 is explicit that a queued action
 *  is safe indefinitely, because prose does not un-happen, so an intent deferred
 *  for budget must survive the pass that could not pay for it. Dropping it would
 *  make the whole budget-governed drain rate meaningless — triage would spend
 *  another ~150 tokens rediscovering something the Engine already knew.
 *
 *  `executed` is what actually did something, which is a smaller set than "what
 *  left the queue": an intent whose subject the World no longer holds is skipped
 *  and consumed, and appears in neither list. The two counts therefore need not
 *  add up to the queue's length, and the useful reading is `executed` for how
 *  much the pass changed and `remaining` for what it owes. */
export type DrainOutcome = {
  executed: Intent[];
  remaining: Intent[];
};

/** §3.3's table, as the drain reads it. Upper bounds, not expectations: the
 *  point is to decide affordability BEFORE starting, and `max_tokens` is what
 *  actually bounds consumption.
 *
 *  Retire is 0 because it is the `{enabled: false}` flag flip of §4.4 and spends
 *  no generation at all. Open is ~150 (a title and a sentence of reminder
 *  prose); revise and condense are full lorebook entry rewrites and are priced
 *  at the same 1024, which is what makes them compete for the same scarce slot.
 *
 *  Priced from day one even for the three kinds that do not act yet: the price
 *  is the budget policy and the arm is the work, and Tasks 3–5 change the arm.
 *  Pricing an unimplemented kind at 0 would leave the policy untested until the
 *  task that depends on it. */
export const INTENT_MAX_TOKENS: Record<Intent["kind"], number> = {
  retire: 0,
  open: 150,
  revise: 1024,
  condense: 1024,
};

/** What the drain did with one intent.
 *
 *  `skipped` is not a failure: the World moved on and the work no longer has a
 *  subject. It leaves the queue for the same reason `executed` does — there is
 *  nothing left to come back for. */
type IntentResult = "executed" | "skipped";

/** §3.3: "Drain while `getAllowedOutput()` stays above a reserve sufficient for
 *  the next triage." The reserve IS the next triage call, so the constant is
 *  imported rather than restated — two numbers would drift and the drain would
 *  starve the step it exists to serve.
 *
 *  Read live on every intent, never once at the start: the bucket empties as the
 *  drain spends, and a single reading would let the drain believe it could
 *  afford two rewrites out of a bucket that covers one. */
function affords(cost: number): boolean {
  return api.v1.script.getAllowedOutput() >= cost + TRIAGE_MAX_TOKENS;
}

/** Retirement is a flag flip (§4.4), and the reasoning is why it must stay one:
 *  the model is never TOLD a plot is over. Telling it "this is resolved" spends
 *  context asserting a negative; disabling the entry simply removes the
 *  reminder.
 *
 *  Two flags, not one. The lorebook entry's `enabled` is what stops the
 *  reminder reaching the model; the thread's `status` is what stops triage
 *  proposing the same retirement on every pass — the manifest lists satisfied
 *  threads with their status, and a retirement the World never recorded would be
 *  re-proposed forever, at ~150 tokens a pass.
 *
 *  The lorebook write comes first and the status flip second, so a failure
 *  converges. Fail after the write and the thread is still open: triage
 *  re-proposes it, and disabling an already-disabled entry is a no-op. Fail in
 *  the other order and the thread reads satisfied while its reminder is still in
 *  the writer's context, with nothing left to notice.
 *
 *  A thread whose status is already `satisfied` is retired anyway rather than
 *  skipped. Phase 5 shipped a status a writer could set by hand with nothing
 *  disabling the entry behind it, so "already satisfied" does not mean "already
 *  retired", and the flip is free and idempotent. */
async function retire(
  threadId: string,
  deps: DrainDeps,
): Promise<IntentResult> {
  const thread = deps.getState().world.threads.find((t) => t.id === threadId);
  // Deleted between triage naming it and the drain reaching it. Nothing to
  // retire and nothing to come back for.
  if (!thread) return "skipped";

  if (thread.lorebookEntryId) {
    await writeLorebookEntry(
      { entryId: thread.lorebookEntryId, nodeId: deps.nodeId },
      // The producer ignores the live entry because a flag flip is not a
      // function of the text — but it still goes through the door, which is
      // what takes the §5.2 snapshot. A retire that called `updateEntry`
      // directly would leave no original, and a later revise would then
      // snapshot `enabled: false` as the writer's own: restoring it would hand
      // them their entry back switched off.
      () => ({ enabled: false }),
    );
  }

  deps.dispatch(threadStatusSet({ threadId, status: "satisfied" }));
  return "executed";
}

/** The branch. One arm per intent kind, no `default`. */
async function execute(intent: Intent, deps: DrainDeps): Promise<IntentResult> {
  switch (intent.kind) {
    case "retire":
      return retire(intent.threadId, deps);

    // Tasks 3–5. Logged exactly as phase 4 logged them, so the line a writer
    // with `story_engine_debug` on already knows does not change meaning
    // underneath them while the arms are still stubs.
    case "revise":
    case "open":
    case "condense":
      await deps.log(`[engine] intent (not executed): ${intentKey(intent)}`);
      return "skipped";
  }
}

/** Spend the queue, oldest first, for as long as the budget allows.
 *
 *  **One intent per pass or several is a real decision, and this is neither.**
 *  The drain runs as many intents as the bucket can pay for, which is what §3.3
 *  asks for — "drain rate is budget-governed, not fixed" — and it is the
 *  arithmetic rather than a rule that produces §3.3's asymmetry: out of a 2048
 *  bucket with ~150 already spent on triage, one 1024 rewrite leaves ~870,
 *  which still clears the 200-token reserve, and a second would not. "One entry
 *  rewrite, or several cheap actions, but not both" is therefore a consequence
 *  here, not a special case — and it stays true when Tasks 3–4 add the actions
 *  that actually cost 1024, which a hardcoded one-per-pass rule would not.
 *
 *  **FIFO among the costly actions, and free actions are never blocked.** When
 *  an intent the budget cannot afford is reached, every later costly intent is
 *  deferred with it rather than jumping ahead: entry rewrites are the scarce
 *  operation §3.3 is built around, and letting cheaper work overtake them would
 *  starve them for as long as triage keeps finding cheap work. Zero-cost intents
 *  are the exception, and §3.3 says so in as many words — "retiring a satisfied
 *  thread never queues, because it costs zero output tokens; the action that
 *  most protects context health is free." A retire held behind an unaffordable
 *  revise would leave a resolved plot in the writer's context for no reason.
 *
 *  The queue is never mutated. The caller writes `remaining` back to the record
 *  (§6.2) at the node it captured. */
export async function drain(
  queue: Intent[],
  deps: DrainDeps,
): Promise<DrainOutcome> {
  const executed: Intent[] = [];
  const remaining: Intent[] = [];
  let blocked = false;

  for (const intent of queue) {
    const cost = INTENT_MAX_TOKENS[intent.kind];
    if (cost > 0 && (blocked || !affords(cost))) {
      blocked = true;
      remaining.push(intent);
      await deps.log(
        `[engine] deferring ${intentKey(intent)} — needs ${cost} + ${TRIAGE_MAX_TOKENS} reserve, budget is ${api.v1.script.getAllowedOutput()}`,
      );
      continue;
    }

    if ((await execute(intent, deps)) === "executed") {
      executed.push(intent);
      await deps.log(`[engine] executed ${intentKey(intent)}`);
    }
  }

  return { executed, remaining };
}
