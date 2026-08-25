// The drain: the one place that branches on `intent.kind`.
//
// The pass reserves the triage call before spending it and then hands whatever
// triage produced to `drain`. Everything an intent does to the writer's story
// happens below this line, and every lorebook write goes through
// `lorebook-write.ts` — a path that skipped the door would be free to build its
// patch from a copy of the entry it fetched before the generation ran, which is
// exactly the staleness §5's read-then-write exists to rule out.
//
// Phase 6 filled the arms in price order. Task 2 took RETIRE, which §3.3 prices
// at zero output tokens, so the skeleton — the branch, the budget policy, the
// queue write-back — was provable end to end before anything cost 1024. Task 3
// added REVISE, the first arm that spends a generation, and Task 4 CONDENSE,
// which §5.1 says is the same price, the same read-then-write, the same door
// and the same record — so the two arms below are deliberately the same shape,
// and differ only where §5.1 says they must. Task 5 added OPEN, the only arm
// that CREATES rather than rewrites: it is the one that hands work to
// `thread-bind.ts`, because a thread's lorebook entry is a shape rather than a
// text and the door is not in front of a create (see there).
//
// The switch has no `default`, and `INTENT_MAX_TOKENS` is a `Record` over the
// union's `kind`. A fifth intent is therefore two compile errors — a missing arm
// and a missing price — rather than an action that silently costs nothing and
// silently does nothing. `intentKey` in intents.ts is the house precedent.

import type { GenX } from "nai-gen-x";
import type { Assessment } from "./assess";
import type { AppDispatch, RootState } from "../store/types";
import type { Intent } from "./loop-machine";
import { intentKey } from "./intents";
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
  composeReminder,
  createOpenFactory,
  openParams,
  OPEN_MAX_TOKENS,
} from "./open-strategy";
import { castFromSubject, findThreadBySubject } from "./thread-bind";
import {
  threadAnchorSet,
  threadCreated,
  threadStatusSet,
} from "../store/slices/world";
import { TRIAGE_MAX_TOKENS } from "./triage-strategy";
import { buildLorebookPrefillFromEntry } from "../utils/lorebook-strategy";

/** What the pass hands the drain.
 *
 *  `log` is the pass's own `story_engine_debug`-gated logger, injected rather
 *  than reached for: the HUD is the always-on surface and the log is opt-in, so
 *  the drain must not acquire a second opinion about whether to speak. */
export type DrainDeps = {
  dispatch: AppDispatch;
  getState: () => RootState;
  /** What the pass saw, whole — the same value triage was built from.
   *
   *  **The assessment rather than a field of it**, which Task 3 predicted and
   *  Task 5 acts on: this started as `newText` because a revision is a function
   *  of what the story has newly made true (§5), and the anchor an `open`
   *  records needs `paragraphCount` as well. Two à-la-carte fields would have
   *  become three, and each one is a decision about which half of one coherent
   *  answer the drain is allowed to see. The assessment is already built,
   *  already passed to triage, and already the definition of "what this pass
   *  read"; passing it entire is what stops the deps growing a field per arm.
   *
   *  **`newText` is deliberately not read from here, and no arm below may.**
   *  A drain runs intents this pass raised AND intents an earlier pass
   *  deferred, and only the first group has anything to do with the prose in
   *  this field — so an arm taking its input from the running pass rewrites a
   *  deferred intent's entry against a scene its subject was never in. The
   *  prose an intent acts on rides on the intent (`Intent` in
   *  `loop-machine.ts`). `paragraphCount` is a property of the BRANCH rather
   *  than of any one intent's prose, so the anchor an `open` records is still
   *  read from here. */
  assessment: Assessment;
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
  open: OPEN_MAX_TOKENS,
  // Each arm's own ceiling, imported rather than restated: the number the
  // drain refuses to start without must be the number `max_tokens` then bounds
  // the call at, or the pass promises one price and pays another.
  revise: REVISE_MAX_TOKENS,
  condense: CONDENSE_MAX_TOKENS,
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
 *  are the arms that rewrite a lorebook entry, and `open`'s ~150 tokens and
 *  `retire`'s zero are not what §3.3 calls the scarce operation. One predicate
 *  rather than two lists, so a fifth intent priced at 1024 cannot be capped
 *  here and uncounted there. */
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
  why: "satisfied" | "abandoned",
  deps: DrainDeps,
): Promise<IntentResult> {
  const thread = deps.getState().world.threads.find((t) => t.id === threadId);
  // Deleted between triage naming it and the drain reaching it. Nothing to
  // retire and nothing to come back for.
  if (!thread) return "skipped";

  if (thread.lorebookEntryId) {
    await writeLorebookEntry(
      thread.lorebookEntryId,
      // The producer ignores the live entry because a flag flip is not a
      // function of the text — but it still comes through the door, because
      // "every Engine write to an entry goes through here" is a rule the
      // source scan can hold and "every write that reads text" is not.
      () => ({ enabled: false }),
    );
  }

  deps.dispatch(threadStatusSet({ threadId, status: why }));
  return "executed";
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

/** §4's thread, opened: a commitment the prose raised, recorded with a
 *  lorebook entry that reminds the story model only once the prose has stopped
 *  carrying it (§4.3).
 *
 *  **A repeat renews rather than opens.** `findThreadBySubject` explains the
 *  reasoning; what matters here is that the free path comes first, so a
 *  commitment triage keeps naming costs a dispatch rather than a generation.
 *
 *  **The thread is created before its entry, and read back before it is
 *  bound.** The cap is a reducer invariant (§4.5) enforced one level up in
 *  `rootReducer`, so what the store kept is the authority on what exists — and
 *  the entry is built from that rather than from the draft this function sent
 *  in, which is also how the reducer's `horizon` and `status` defaults reach the
 *  condition. The other order — entry first, thread second — would leave an
 *  always-on entry in the writer's lorebook with no thread behind it if
 *  anything failed in between, which is precisely §4.5's orphan.
 *
 *  **Opening at the ceiling displaces, and does not refuse.** §4.5 designed the
 *  cap for exactly this path: the reducer drops the weakest OTHER thread and
 *  keeps the newcomer, because a create that silently undid itself would read
 *  as a broken Engine. The displaced thread's own lorebook entry survives,
 *  unmanaged and still enabled — the Engine never deletes an entry — so this
 *  arm disables it and says so in the log. */
async function open(
  subject: string,
  prose: string,
  deps: DrainDeps,
): Promise<IntentResult> {
  const before = deps.getState().world.threads;
  const paragraph = deps.assessment.paragraphCount;

  const existing = findThreadBySubject(before, subject);
  if (existing) {
    deps.dispatch(threadAnchorSet({ threadId: existing.id, paragraph }));
    await deps.log(
      `[engine] open ${subject}: already open as "${existing.title}" — renewed at paragraph ${paragraph}`,
    );
    return "executed";
  }

  const response = await deps.genX.generate(
    createOpenFactory({ subject, newText: prose }),
    {
      ...(await openParams()),
      maxRetries: 0,
      // §3.5: a background loop has no business demanding a Continue click.
      // Without this GenX parks on a short bucket, and its parked status is
      // instance-wide — one held Engine call flags the whole queue, which the
      // header renders as a Continue widget for work nobody asked for.
      fastRejection: true,
      taskId: `engine-open-${api.v1.uuid()}`,
    },
    undefined,
    "background",
  );

  const choice = response.choices?.[0];
  const text = composeReminder(choice?.text ?? "", choice?.finish_reason);
  if (!text) {
    // Nothing is created. Unlike a revise, which declines a write and leaves an
    // entry standing, this declines the whole thing — a thread with a blank
    // reminder is an always-on entry with nothing to say.
    await deps.log(
      `[engine] open ${subject}: nothing usable in the response, no thread opened`,
    );
    return "skipped";
  }

  const threadId = api.v1.uuid();
  deps.dispatch(
    threadCreated({
      thread: {
        id: threadId,
        // The subject IS the title. Triage wrote it, `intentKey` dedupes on it,
        // and `findThreadBySubject` renews on it — a title from anywhere else
        // would break the identity that keeps one commitment to one thread.
        title: subject.trim(),
        text,
        entityIds: castFromSubject(
          subject,
          Object.values(deps.getState().world.entitiesById),
        ),
        anchorParagraph: paragraph,
      },
    }),
  );

  const state = deps.getState();
  const created = state.world.threads.find((t) => t.id === threadId);
  // The cap keeps the newcomer by construction (`enforceThreadCap`), so this is
  // the invariant holding rather than a case to handle — but an entry created
  // for a thread the store does not hold is exactly the unmanaged always-on
  // orphan §4.5 is about, and that is not a risk worth taking on an assertion.
  if (!created) return "skipped";

  for (const gone of before.filter(
    (t) => !state.world.threads.some((kept) => kept.id === t.id),
  )) {
    // §4.5's orphan, and this is the only place it is answered. The store
    // dropped the thread and the reducer cannot touch its lorebook entry,
    // which would otherwise survive unmanaged and STILL ENABLED — going on
    // injecting a reminder for a commitment nothing records any more. §4.5
    // names that
    // exactly: "the cap bounds the list, not the context", so a story that
    // repeatedly hit the ceiling would accumulate strictly more always-on
    // injections than the cap ever permitted threads. Proliferation control
    // increasing proliferation.
    //
    // **Here, because here is where the entry is attributably ours.** We are
    // holding the thread that owned it. §7's reconciliation used to cover the
    // same case from the other side — disabling any `SE: Threads` entry no
    // thread named — but it could only attribute by category, it only ran on a
    // navigation, and it is gone with the rest of history tracking. There is no
    // second pass behind this one: miss the orphan here and it injects forever.
    //
    // **Disabled, never deleted**, through the door like every other Engine
    // write. The entry stays in the writer's lorebook and one switch brings it
    // back — which is the whole of the writer's recourse now that nothing
    // switches it on again on their behalf.
    await deps.log(
      `[engine] thread cap displaced "${gone.title}" — its lorebook entry ${gone.lorebookEntryId ?? "(none)"} is no longer managed by a thread`,
    );
    if (gone.lorebookEntryId) {
      await writeLorebookEntry(gone.lorebookEntryId, () => ({
        enabled: false,
      }));
    }
  }

  // The entry is not minted here. `registerThreadConditionEffects` subscribes
  // to `threadCreated` and gives every named thread one — the Forge's and the
  // writer's as well as this — and two creators racing the same dispatch would
  // be two entries for one thread. Opening the thread is the work this arm
  // reports; binding an entry to it is the same job for every creator.
  return "executed";
}

/** The branch. One arm per intent kind, no `default`. */
async function execute(intent: Intent, deps: DrainDeps): Promise<IntentResult> {
  switch (intent.kind) {
    case "retire":
      return retire(intent.threadId, intent.why, deps);

    case "revise":
      return revise(intent.entityId, intent.prose, deps);

    case "condense":
      return condense(intent.entryId, deps);

    case "open":
      return open(intent.subject, intent.prose, deps);
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
  let rewrites = 0;

  for (const intent of queue) {
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
      if ((await execute(intent, deps)) === "executed") {
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
      // the writer is plainly mid-generation. Free intents still run: a retire
      // spends no generation and so cannot collide with one.
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
