// The drain: the one place that branches on `intent.kind`.
//
// The pass reserves the triage call before spending it and then hands whatever
// triage produced to `drain`. Everything an intent does to the writer's story
// happens below this line, and every lorebook write goes through
// `lorebook-write.ts` — a path that skipped the door would be free to build its
// patch from a copy of the entry it fetched before the generation ran, which is
// exactly the staleness §5's read-then-write exists to rule out.
//
// The two entry arms, REVISE and CONDENSE, are deliberately the same shape: the
// same price, the same read-then-write, the same door and the same record
// (§5.1), and they differ only where §5.1 says they must. The Thread arms
// (WRITE, ADMIT, CONCLUDE) rewrite the World's own record of an arc rather than
// a lorebook entry; the entry follows through `thread-bind.ts`.
//
// The switch has no `default`, and `INTENT_MAX_TOKENS` is a `Record` over the
// union's `kind`. A new intent is therefore two compile errors — a missing arm
// and a missing price — rather than an action that silently costs nothing and
// silently does nothing. `intentKey` in intents.ts is the house precedent.

import type { GenX } from "nai-gen-x";
import type { AppDispatch, RootState } from "../store/types";
import type { Intent } from "./loop-machine";
import { dedupe, intentKey } from "./intents";
import { writeLorebookEntry } from "./lorebook-write";
import { isConcurrencyRefusal } from "./refusal";
import {
  composeRevision,
  createReviseFactory,
  reviseParams,
  REVISE_MAX_TOKENS,
} from "./revise-strategy";
import {
  composeCondensation,
  condenseParams,
  createCondenseFactory,
  CONDENSE_MAX_TOKENS,
  writeCondenseMark,
} from "./condense";
import {
  createThreadWriteFactory,
  lintState,
  parseThreadWrite,
  threadWriteParams,
  THREAD_WRITE_MAX_TOKENS,
  type ThreadRecord,
  type ThreadWriteInput,
} from "./thread-write-strategy";
import { syncThreadEntry } from "./thread-bind";
import { atThreadCap } from "./thread-cap";
import { TRIAGE_MAX_TOKENS } from "./triage-strategy";
import {
  threadCreated,
  threadLedgerUpdated,
  threadStatusSet,
} from "../store/slices/world";
import { buildLorebookPrefillFromEntry } from "../utils/lorebook-strategy";

/** What the pass hands the drain.
 *
 *  `log` is the pass's own `story_engine_debug`-gated logger, injected rather
 *  than reached for: the HUD is the always-on surface and the log is opt-in, so
 *  the drain must not acquire a second opinion about whether to speak. */
export type DrainDeps = {
  dispatch: AppDispatch;
  getState: () => RootState;
  /** The pass's generation queue. Injected rather than reached for (CLAUDE.md:
   *  no singletons), and the same instance triage used, so the Engine's own
   *  calls stay serialised behind one queue. */
  genX: GenX;
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
 *  Revise and condense are full lorebook entry rewrites and are priced at the
 *  same 1024, which is what makes them compete for the same scarce slot.
 *
 *  Every intent kind is priced, because the price is the budget policy and the
 *  arm is the work: a kind priced at 0 skips the budget check entirely, so
 *  `conclude` is the only one that may be, and says why below. */
export const INTENT_MAX_TOKENS: Record<Intent["kind"], number> = {
  // Each arm's own ceiling, imported rather than restated: the number the
  // drain refuses to start without must be the number `max_tokens` then bounds
  // the call at, or the pass promises one price and pays another.
  revise: REVISE_MAX_TOKENS,
  condense: CONDENSE_MAX_TOKENS,
  threadWrite: THREAD_WRITE_MAX_TOKENS,
  admit: THREAD_WRITE_MAX_TOKENS,
  // Free: a status flip and a disabled entry. The rewrites it queues are
  // priced as the `revise` intents they are.
  conclude: 0,
};

/** How many full entry rewrites one pass may start (§3.3).
 *
 *  **The budget check alone does not deliver this, and that was an unverified
 *  assumption.** §3.3 reasons that out of a 2048 bucket with ~150 spent on
 *  triage, one 1024 rewrite leaves ~870 and a second will not clear
 *  `1024 + 200` — which is only true if the host debits the REQUESTED
 *  `max_tokens`. If it debits what was produced, and a rewrite typically lands
 *  at 200–400 tokens, the bucket clears the check again and again and one pass
 *  spends three or four. Nothing in this project has measured which the host
 *  does; §12.0's probe measured refusals, not successes.
 *
 *  So the guarantee is made by construction rather than inferred from
 *  arithmetic. §3.3's "one entry rewrite, or several cheap actions, but not
 *  both" and the changelog's promise that a pass defers a rewrite rather than
 *  taking it out of the writer's next generation both hold whichever way the
 *  host accounts. The budget check stays exactly as it was: it is the tighter
 *  of the two whenever the bucket is genuinely low, and it is what stops a
 *  pass starting a rewrite it cannot pay for at all. */
export const ENTRY_REWRITES_PER_PASS = 1;

/** The intents that spend a full 1024-token entry rewrite.
 *
 *  Same two `revisionsIn` counts, and for the same reason: revise and condense
 *  are the arms that rewrite a lorebook entry, which §3.3 calls the scarce
 *  operation. One predicate rather than two lists, so a new intent priced at
 *  1024 cannot be capped here and uncounted there. */
function isEntryRewrite(intent: Intent): boolean {
  return intent.kind === "revise" || intent.kind === "condense";
}

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

/** §5's entry rewrite: the entry as it stands, plus the prose that changed it,
 *  becomes the entry as it stands now.
 *
 *  **The generation happens INSIDE the door's producer callback**, which is the
 *  whole shape of this function. The door hands over the live entry and takes a
 *  patch back, so the prompt is necessarily built from what the entry says at
 *  the moment of writing — §5's read-then-write is structural here rather than
 *  remembered. A refusal, a decline, or a crash mid-generation therefore
 *  leaves the entry exactly as the writer left it.
 *
 *  The Engine does NOT reuse `buildLorebookContentStrategy` for this. That path
 *  resolves the live entry inside its own message factory and its completion
 *  handler calls `updateEntry` directly, so a revise built on it would write
 *  around the door, against an entry read before the generation started.
 *  `revise-strategy.ts` returns text to its caller instead, and the caller is
 *  the door.
 *
 *  Three ways this consumes the intent without spending anything: the entity is
 *  gone, the entity is a draft with no entry to rewrite, or the writer deleted
 *  the entry (the door declines, and never recreates it — §6.2.1's uncovered
 *  ancestor, by another route). A refused or unusable generation also declines,
 *  and `written` is what tells the two apart from a write. */
async function revise(
  entityId: string,
  prose: string,
  established: string | undefined,
  deps: DrainDeps,
): Promise<IntentResult> {
  const entity = deps.getState().world.entitiesById[entityId];
  if (!entity) return "skipped";

  const entryId = entity.lorebookEntryId;
  if (!entryId) {
    // A draft the writer never cast. Casting one here would create a lorebook
    // entry the writer did not ask for, which is not what REVISE means.
    await deps.log(
      `[engine] revise ${entity.name}: no lorebook entry, skipped`,
    );
    return "skipped";
  }

  const written = await writeLorebookEntry(entryId, async (live) => {
    const prefill = await buildLorebookPrefillFromEntry(
      deps.getState,
      live,
      // Nobody is watching this. The edit pane's title draft is mirrored on
      // every keystroke, so honouring it here would make a half-typed name
      // the header of an entry the Engine rewrote on its own.
      "unattended",
    );
    const response = await deps.genX.generate(
      createReviseFactory({
        entry: live,
        prefill,
        newText: prose,
        established,
      }),
      {
        ...(await reviseParams()),
        // GenX's own transient-error handler treats "in progress" as
        // retryable and would sit on a collision for five backoffs, holding
        // the pass, its node and its re-entry guard. The drain requeues a
        // refused revise instead — see `drain`.
        maxRetries: 0,
        // §3.5: a background loop has no business demanding a Continue click.
        // Without this GenX parks on a short bucket, and its parked status is
        // instance-wide — one held Engine call flags the whole queue, which the
        // header renders as a Continue widget for work nobody asked for.
        fastRejection: true,
        taskId: `engine-revise-${api.v1.uuid()}`,
      },
      undefined,
      "background",
    );

    const choice = response.choices?.[0];
    const text = await composeRevision(
      prefill,
      choice?.text ?? "",
      choice?.finish_reason,
    );
    if (!text) {
      // Declining leaves the entry exactly as it was. Writing an empty or
      // half-finished revision would DELETE the writer's entry, because a
      // revision replaces rather than appends.
      await deps.log(
        `[engine] revise ${entity.name}: nothing usable in the response, entry left alone`,
      );
      return null;
    }
    return { text };
  });

  return written ? "executed" : "skipped";
}

/** §5.1's compaction: the entry as it stands, said tighter.
 *
 *  Structurally a revise — the generation runs INSIDE the door's producer, so
 *  read-then-write is a property of the shape rather than something this
 *  function remembers — and §5.1 requires that: same price, same door, so
 *  nothing downstream can tell the two apart.
 *  What is not shared is how the answer is judged (`composeCondensation` refuses a summary
 *  and refuses a truncation) and what happens afterwards.
 *
 *  **The mark is what happens afterwards, and it is the whole reason this arm
 *  is longer than revise's.** The trigger in `assess` fires on length alone, so
 *  an entry whose facts genuinely do not fit under the threshold would be
 *  offered again on the very next pass — spending §3.3's one entry rewrite
 *  every pass, forever, and dropping a little more each time it succeeded. The
 *  mark records how long the entry was at this ATTEMPT, and `worthCondensing`
 *  then requires another paragraph of growth before offering it again.
 *
 *  Written after the door returns rather than inside the producer, and only
 *  when the model actually answered: a write that threw, or a collision with
 *  the writer, leaves no mark and is retried on the next pass. A refusal is
 *  free (§12.0) and self-clearing (§3.4), so deferring the work a paragraph for
 *  one would be paying for someone else's timing. */
async function condense(
  entryId: string,
  deps: DrainDeps,
): Promise<IntentResult> {
  // No World lookup, unlike revise: the intent names a lorebook entry, not an
  // entity, because the trigger measures entries. The door's read is the only
  // existence check there is to make, and the writer deleting the entry between
  // assessment and the drain is the same declined write as any other.
  let markTo: number | undefined;

  const written = await writeLorebookEntry(entryId, async (live) => {
    const original = live.text ?? "";
    const prefill = await buildLorebookPrefillFromEntry(
      deps.getState,
      live,
      // Nobody is watching this. The edit pane's title draft is mirrored on
      // every keystroke, so honouring it here would make a half-typed name
      // the header of an entry the Engine rewrote on its own.
      "unattended",
    );
    const response = await deps.genX.generate(
      createCondenseFactory({ entry: live, prefill }),
      {
        ...(await condenseParams()),
        maxRetries: 0,
        // §3.5: a background loop has no business demanding a Continue click.
        // Without this GenX parks on a short bucket, and its parked status is
        // instance-wide — one held Engine call flags the whole queue, which the
        // header renders as a Continue widget for work nobody asked for.
        fastRejection: true,
        taskId: `engine-condense-${api.v1.uuid()}`,
      },
      undefined,
      "background",
    );

    const choice = response.choices?.[0];
    const text = await composeCondensation(
      prefill,
      choice?.text ?? "",
      choice?.finish_reason,
      original,
    );

    // The model answered, so this counts as an attempt either way — at the
    // length the entry will actually be left at.
    markTo = text ? text.length : original.length;

    if (!text) {
      await deps.log(
        `[engine] condense ${entryId}: nothing usable in the response, entry left alone`,
      );
      return null;
    }
    return { text };
  });

  if (markTo !== undefined) await writeCondenseMark(entryId, markTo);
  return written ? "executed" : "skipped";
}

/** The cast as the Thread write prompt is shown it. Members the World no
 *  longer holds are left out. */
function castOf(
  deps: DrainDeps,
  entityIds: readonly string[],
): ThreadWriteInput["cast"] {
  const { entitiesById } = deps.getState().world;
  return entityIds
    .map((id) => entitiesById[id])
    .filter((entity) => entity !== undefined)
    .map((entity) => ({ name: entity.name, summary: entity.summary }));
}

/** One Thread write, with the lint and its single retry.
 *
 *  The retry is the same conversation with the model's own answer and the
 *  rejection appended, so the generation whose output was refused is the one
 *  that sees why. It runs only if the bucket still covers it — the drain
 *  priced this intent at ONE call, and a retry that overdrew would be taken
 *  out of the writer's next generation.
 *
 *  Null declines: nothing usable came back, or STATE pointed forward twice.
 *  The caller leaves the World exactly as it was. */
async function writeThread(
  input: ThreadWriteInput,
  label: string,
  deps: DrainDeps,
): Promise<ThreadRecord | null> {
  const ask = async (rejection?: { reply: string; phrase: string }) => {
    const response = await deps.genX.generate(
      createThreadWriteFactory(input, rejection),
      {
        ...(await threadWriteParams()),
        maxRetries: 0,
        // §3.5 of the Engine design: a background loop must not demand a
        // Continue click, and GenX's parked status is instance-wide.
        fastRejection: true,
        taskId: `engine-thread-${api.v1.uuid()}`,
      },
      undefined,
      "background",
    );
    const choice = response.choices?.[0];
    const reply = choice?.text ?? "";
    return { reply, record: parseThreadWrite(reply, choice?.finish_reason) };
  };

  const first = await ask();
  if (!first.record) {
    await deps.log(`[engine] ${label}: nothing usable in the response`);
    return null;
  }
  const phrase = lintState(first.record.state);
  if (!phrase) return first.record;

  await deps.log(
    `[engine] ${label}: STATE pointed forward ("${phrase}") — asking again`,
  );
  if (!affords(THREAD_WRITE_MAX_TOKENS)) {
    await deps.log(`[engine] ${label}: no budget for the retry, declined`);
    return null;
  }

  const second = await ask({ reply: first.reply, phrase });
  const again = second.record ? lintState(second.record.state) : "";
  if (!second.record || again) {
    await deps.log(
      `[engine] ${label}: declined after the retry${again ? ` ("${again}")` : ""}`,
    );
    return null;
  }
  return second.record;
}

/** Rewrite an open Thread's ledger from the prose a review read.
 *
 *  Skipped when the Thread is gone or no longer open: the writer deleted or
 *  concluded it while this was queued, and writing would resurrect it. The
 *  lorebook entry follows through `thread-bind.ts`'s effect on
 *  `threadLedgerUpdated`. */
async function threadWrite(
  threadId: string,
  prose: string,
  deps: DrainDeps,
): Promise<IntentResult> {
  const thread = deps.getState().world.threads.find((t) => t.id === threadId);
  if (!thread || thread.status !== "open") return "skipped";

  const record = await writeThread(
    {
      title: thread.title,
      cast: castOf(deps, thread.entityIds),
      current: { state: thread.state, latent: thread.latent },
      prose,
    },
    `thread "${thread.title}"`,
    deps,
  );
  if (!record) return "skipped";

  // The call took time, and the reducer does not check status: a Thread the
  // writer concluded or deleted meanwhile must stay as they left it.
  const now = deps.getState().world.threads.find((t) => t.id === threadId);
  if (!now || now.status !== "open") return "skipped";

  deps.dispatch(
    threadLedgerUpdated({
      threadId,
      state: record.state,
      latent: record.latent,
    }),
  );
  await deps.log(`[engine] thread "${thread.title}" updated: ${record.moved}`);
  return "executed";
}

/** The admission floors the World can change after a review ran, read against
 *  the state as it stands now: the cast it still holds, and whether the Thread
 *  limit or an open Thread with that same cast rules the admission out. Used
 *  both before the generation, so nothing is spent on a refusal, and after it,
 *  so nothing is created from a stale decision. Null refuses; the reason is
 *  logged. */
async function admissible(
  title: string,
  entityIds: string[],
  deps: DrainDeps,
): Promise<string[] | null> {
  const state = deps.getState();
  const cast = entityIds.filter((id) => state.world.entitiesById[id]);
  if (cast.length === 0) return null;

  if (atThreadCap(state.world.threads, state.engine.settings.threadCap)) {
    await deps.log(`[engine] admit "${title}": thread limit reached, refused`);
    return null;
  }
  // Against each Thread's live cast, as `cast` itself is: an id the World no
  // longer holds must not make the same arc look like a different one.
  const twin = state.world.threads.find((t) => {
    if (t.status !== "open") return false;
    const live = t.entityIds.filter((id) => state.world.entitiesById[id]);
    return live.length === cast.length && cast.every((id) => live.includes(id));
  });
  if (twin) {
    await deps.log(
      `[engine] admit "${title}": "${twin.title}" already has this cast, refused`,
    );
    return null;
  }
  return cast;
}

/** Admit a new Thread.
 *
 *  The floors already passed when the review ran; the two that the World can
 *  have changed since are checked again here, before anything is spent and
 *  again before anything is created. The Thread is created only once the model
 *  has returned a clean `state`, so a declined admission leaves no Thread and
 *  no lorebook entry. The entry itself is minted by `thread-bind.ts`'s effect
 *  on `threadCreated`. */
async function admit(
  title: string,
  entityIds: string[],
  prose: string,
  deps: DrainDeps,
): Promise<IntentResult> {
  const cast = await admissible(title, entityIds, deps);
  if (!cast) return "skipped";

  const record = await writeThread(
    { title, cast: castOf(deps, cast), current: null, prose },
    `admit "${title}"`,
    deps,
  );
  if (!record) return "skipped";

  // The World may have moved during the generation — the writer or a Forge
  // can have created a Thread, or deleted a cast member — so the floors that
  // gated the spend gate the write too.
  const finalCast = await admissible(title, cast, deps);
  if (!finalCast) return "skipped";

  deps.dispatch(
    threadCreated({
      thread: {
        id: api.v1.uuid(),
        title: title.trim(),
        state: record.state,
        latent: record.latent,
        entityIds: finalCast,
      },
    }),
  );
  await deps.log(`[engine] admitted thread "${title}"`);
  return "executed";
}

/** Conclude a Thread: its state has become a permanent fact.
 *
 *  Free. The status flips, the entry is disabled, and one `revise` is spawned
 *  for each cast member that has a lorebook entry, carrying the Thread's whole
 *  ledger as `established`. That is how the settled arc reaches the
 *  characters' own entries — and it is the one route by which `latent` is ever
 *  written toward the lorebook, after the thing it held back has happened.
 *
 *  The entry is synced here as well as by the effect: the effect is
 *  fire-and-forget, and a pass that reports this intent executed should have
 *  the entry off by the time it does. */
async function conclude(
  threadId: string,
  prose: string,
  deps: DrainDeps,
  spawn: (intents: Intent[]) => void,
): Promise<IntentResult> {
  const thread = deps.getState().world.threads.find((t) => t.id === threadId);
  if (!thread || thread.status !== "open") return "skipped";

  deps.dispatch(threadStatusSet({ threadId, status: "concluded" }));
  await syncThreadEntry(deps.getState, threadId);

  const established = [thread.title, thread.state, thread.latent]
    .map((part) => part.trim())
    .filter(Boolean)
    .join("\n");
  const { entitiesById } = deps.getState().world;
  spawn(
    thread.entityIds
      .filter((id) => entitiesById[id]?.lorebookEntryId)
      .map((entityId) => ({ kind: "revise", entityId, prose, established })),
  );
  await deps.log(`[engine] thread "${thread.title}" concluded`);
  return "executed";
}

/** The branch. One arm per intent kind, no `default`. `spawn` is how an arm
 *  hands the drain follow-up work without reaching for the queue itself. */
async function execute(
  intent: Intent,
  deps: DrainDeps,
  spawn: (intents: Intent[]) => void,
): Promise<IntentResult> {
  switch (intent.kind) {
    case "revise":
      return revise(intent.entityId, intent.prose, intent.established, deps);

    case "condense":
      return condense(intent.entryId, deps);

    case "threadWrite":
      return threadWrite(intent.threadId, intent.prose, deps);

    case "admit":
      return admit(intent.title, intent.entityIds, intent.prose, deps);

    case "conclude":
      return conclude(intent.threadId, intent.prose, deps, spawn);
  }
}

/** Spend the queue, oldest first, for as long as the budget allows.
 *
 *  **Two gates, and they are not the same gate.** The budget check is §3.3's
 *  "drain rate is budget-governed, not fixed": the bucket is re-read before
 *  every intent, so what the pass can afford is decided against what is
 *  actually left rather than against a reading taken before it started
 *  spending. The rewrite cap is §3.3's asymmetry — "one entry rewrite, or
 *  several cheap actions, but not both" — held by construction.
 *
 *  This was one gate, and the second is the correction. The asymmetry was left
 *  to fall out of the arithmetic: 2048 less ~150 for triage leaves ~1900, one
 *  1024 rewrite leaves ~870, and 870 does not clear `1024 + 200`. Every step of
 *  that assumes the host debits the REQUESTED `max_tokens`, and nothing has
 *  established that it does. Debited what it produced instead, a rewrite that
 *  lands at 300 tokens leaves a bucket that clears the check again — and the
 *  drain spends three or four rewrites out of a window the writer is also
 *  drawing on, which is exactly what §3.5 and the changelog promise it will
 *  not. See `ENTRY_REWRITES_PER_PASS`.
 *
 *  **FIFO among the costly actions, and a zero-priced kind is never blocked.**
 *  When an intent the budget cannot afford is reached, every later costly
 *  intent is deferred with it rather than jumping ahead: entry rewrites are the
 *  scarce operation §3.3 is built around, and letting cheaper work overtake them
 *  would starve them. An intent kind priced at zero spends no generation, so it
 *  is exempt from both the budget check and the deferral. Only `conclude` is
 *  priced at zero: it is a status flip and a disabled entry.
 *
 *  The queue passed in is never mutated. The caller writes `remaining` back to the record
 *  (§6.2) at the node it captured. */
export async function drain(
  queue: Intent[],
  deps: DrainDeps,
): Promise<DrainOutcome> {
  const executed: Intent[] = [];
  const remaining: Intent[] = [];
  let blocked = false;
  let rewrites = 0;

  // A working copy, because an arm may spawn follow-up intents (a conclusion
  // queues its cast's rewrites). They join what is still PENDING, through the
  // queue's own dedupe — never what has already run, or a spawned revise would
  // collide with one this pass just executed and never run.
  let pending = [...queue];

  while (pending.length > 0) {
    const intent = pending.shift() as Intent;
    const cost = INTENT_MAX_TOKENS[intent.kind];
    const rewrite = isEntryRewrite(intent);
    const capped = rewrite && rewrites >= ENTRY_REWRITES_PER_PASS;
    if (cost > 0 && (blocked || capped || !affords(cost))) {
      blocked = true;
      remaining.push(intent);
      await deps.log(
        capped
          ? `[engine] deferring ${intentKey(intent)} — this pass has already spent its entry rewrite`
          : `[engine] deferring ${intentKey(intent)} — needs ${cost} + ${TRIAGE_MAX_TOKENS} reserve, budget is ${api.v1.script.getAllowedOutput()}`,
      );
      continue;
    }

    // Counted where the intent is REACHED, not where it writes. A revision the
    // model returned nothing usable for still spent its generation — the door
    // declined the write, the backend did not un-debit the tokens — so
    // counting writes would let a pass that declined once start a second
    // 1024-token call. The cost of counting attempts is that a rewrite which
    // exits before generating (its entity deleted, its entry gone) consumes
    // the pass's slot; that intent was being consumed either way, and the
    // conservative direction is the one that keeps the promise.
    if (rewrite) rewrites++;

    try {
      const result = await execute(intent, deps, (spawned) => {
        // Against what was deferred earlier in this pass as well as what is
        // still pending, so a settled revise replaces a plain one of the same
        // entity wherever it waits, instead of queueing a second rewrite.
        // `dedupe` keeps the existing prefix in place, so the two halves split
        // back apart. Never against `executed`: that rewrite has run, and the
        // settled one still has to.
        const held = remaining.length;
        const merged = dedupe([...remaining, ...pending], spawned);
        remaining.splice(0, held, ...merged.slice(0, held));
        pending = merged.slice(held);
      });
      if (result === "executed") {
        executed.push(intent);
        await deps.log(`[engine] executed ${intentKey(intent)}`);
      }
    } catch (error) {
      // A failure nobody recognises belongs to the pass: it owns the classifier
      // and the stall counter (§9.1's ⚠), and a drain that swallowed real
      // faults would leave that slot permanently dark while the Engine did
      // nothing every pass.
      if (!isConcurrencyRefusal(error)) throw error;

      // A collision is routine and self-clearing (§3.4). The work is still
      // wanted — prose does not un-happen (§3.3) — so the intent is requeued
      // rather than consumed, and the drain stops paying for costly work while
      // the writer is plainly mid-generation. A zero-priced intent would still
      // run: it spends no generation and so cannot collide with one.
      blocked = true;
      remaining.push(intent);
      await deps.log(
        `[engine] ${intentKey(intent)} collided with the writer — requeued`,
      );
    }
  }

  return { executed, remaining };
}

/** How many entry rewrites a drain actually made — `LoopState.touched`, and
 *  §9.1's `∆`.
 *
 *  Lives here rather than at the pass, because "what counts as touching an
 *  entry" is a property of the arms: revise and condense are the two that
 *  rewrite one, and only one that WROTE reaches `executed`. A declined or
 *  skipped rewrite never does, so the count is writes and not attempts.
 *
 *  **A condense counts.** §9.1's slot is an activity level, and a condense is a
 *  rewrite of the writer's entry — the one action that can lose something, and
 *  therefore the last one to leave out of the number that says how much the
 *  Engine has been doing. Widened here rather than given a second counter,
 *  because the HUD has one slot and two numbers in it would have to be added
 *  back together to read it. */
export function revisionsIn(executed: Intent[]): number {
  return executed.filter(
    (intent) => intent.kind === "revise" || intent.kind === "condense",
  ).length;
}
