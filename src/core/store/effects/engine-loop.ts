// The Engine's loop: the single onGenerationRequested registration, and the
// pass that registration wakes.
//
// api.v1.hooks.register holds ONE callback per hook name, so this is the only
// place in the codebase that may register this hook — a second registration
// anywhere silently replaces this one and the Engine simply stops waking, with
// nothing in the UI to explain it. Guarded by a source scan in
// tests/core/engine/trigger.test.ts, plus a wiring guard: the source scan alone
// passes just as happily when nothing calls registerEngineLoopEffects at all.
// This is the only hook Story Engine registers — history-sync.ts held the other
// one, for onHistoryNavigated, and went with §7's reconciliation.
//
// Design §3.1. A user generation schedules a ONE-SHOT wakeup a configurable
// delay later. Three properties carry the whole trigger:
//
//   1. `scriptInitiated: false` is a filter, not a detail. The Engine's own
//      generations go through this hook too; without the filter each pass
//      re-arms the wakeup that started it and the loop drives itself forever.
//   2. One wakeup per window. A further generation while one is pending does
//      NOT reschedule it, so the pass is anchored to the FIRST generation of a
//      burst — no stacking, and no starvation for a writer who generates faster
//      than the delay.
//   3. The delay is measured from generation start, deliberately. A pass that
//      lands mid-stream is refused by the backend lock, and a refusal is free
//      (§12.0). Tracking an in-flight window instead would be a persistent flag
//      that can fail to close — one missed onGenerationEnd and the Engine is
//      gated off permanently and silently.
//
// There is no idle or fallback tick. Prose written by hand produces no hook and
// therefore no wakeup: §1.2 calls that a positioning decision, not a gap. The
// same shape is what makes the loop safe by construction (§3.5) — when the
// writer stops generating, the Engine goes quiet on its own.
//
// No timer id is stored. api.v1.timers.setTimeout returns a Promise<number>,
// which is awkward to hold and clear (§3.1 points at autosave.ts's
// cancellation-flag pattern for the same reason). Nothing here ever cancels a
// wakeup — the `pending` flag below is the whole of the bookkeeping.

import { matchesAction, type Store } from "nai-store";
import type { GenX, MessageFactory } from "nai-gen-x";
import type { AppDispatch, RootState, WorldEntity } from "../types";
import {
  assess,
  oversizedEntries,
  type EntrySize,
  type Watermark,
} from "../../engine/assess";
import { readEngineSettings, type EngineSettings } from "../../engine/settings";
import { canStartPass, type Intent } from "../../engine/loop-machine";
import {
  dedupe,
  ENGINE_LOOP_KEY,
  type EngineRecord,
} from "../../engine/intents";
import { drain, revisionsIn } from "../../engine/execute";
import { readCondenseMark, worthCondensing } from "../../engine/condense";
import {
  backoffMs,
  isBudgetHold,
  isConcurrencyRefusal,
  MAX_ATTEMPTS,
} from "../../engine/refusal";
import {
  createTriageFactory,
  parseTriage,
  triageParams,
  TRIAGE_MAX_TOKENS,
  type TriageManifest,
} from "../../engine/triage-strategy";
import {
  applyFloors,
  buildReviewManifest,
  createReviewFactory,
  parseReview,
  reviewParams,
  reviewWindow,
  REVIEW_MAX_TOKENS,
  type ReviewDecision,
  type ReviewWindow,
} from "../../engine/review-strategy";
import { entityAliases, syncOpenThreadEntries } from "../../engine/thread-bind";
import { formatFoundationBlock } from "../../utils/context-builder";
import {
  engineBacklogObserved,
  engineLoopEvent,
  engineReviewBacklogObserved,
  engineSettingsChanged,
} from "../slices/engine";
import { FIELD_CONFIGS } from "../../../config/field-definitions";
import { createEngineLog, type EngineLog } from "../../engine/log";

/** Everything the loop needs from the app, as one object so the pass body can
 *  reach for another dependency without reshuffling an argument list.
 *
 *  `subscribeEffect` carries the HUD's manual ⚡ request, `dispatch` mirrors
 *  LoopState into the store, `getState` supplies the World the manifest is
 *  built from and the machine state the re-entry guard reads, and `genX` runs
 *  the one triage generation a pass spends. */
export type EngineLoopDeps = {
  subscribeEffect: Store<RootState>["subscribeEffect"];
  dispatch: AppDispatch;
  getState: () => RootState;
  genX: GenX;
};

// ───────────────────────────────── The pass ─────────────────────────────────
//
// Everything with a side effect lives below this line: reading the document,
// reading and writing the two branch-scoped records, spending the one triage
// generation, and mirroring the machine into the store. The machine, assess,
// dedupe, the refusal classifier and the triage parser are all pure and are
// tested without any of this.
//
// Five rules are load-bearing and each is a way this goes quietly wrong:
//
//   1. The watermark advances ONLY on a completed pass. A failed or refused
//      pass that moved it would mark prose the Engine never read as seen, and
//      unlike a dropped intent that is unrecoverable. It records an OFFSET as
//      well as a section id for the same reason from the other direction:
//      generation resumes INSIDE a section, so a section id alone marks
//      everything later appended to that paragraph as read (see assess.ts's
//      `Watermark`).
//   2. The minimum-new-prose setting gates BEFORE the machine starts, because
//      the machine
//      only ends a pass early at `backlog === 0` and any positive backlog goes
//      on to spend the generation. Faking `assessed { backlog: 0 }` instead
//      would terminate correctly and lie to the HUD about how far behind the
//      Engine is — so the skip reports the real number via
//      `engineBacklogObserved` and dispatches no machine event at all.
//   3. `retryable` comes from the classifier, never from the callsite. Hardcode
//      false and ordinary writing lights the HUD's ⚠; hardcode true and ⚠
//      becomes unreachable.
//   4. Both watermarks and the queue are ONE storyStorage record, read once at
//      the start of the pass and written at the two points below. They are the
//      loop's memory of the story rather than of a point in it, so nothing
//      here reverts when the writer undoes — see intents.ts.

/** The HUD's ⚡: run a pass now. Carries no payload — everything the pass needs
 *  it reads for itself — and is ignored while one is already running. */
const ENGINE_PASS_REQUESTED = "engine/passRequested";
export const enginePassRequested = () => ({
  type: ENGINE_PASS_REQUESTED as typeof ENGINE_PASS_REQUESTED,
  payload: undefined,
});
enginePassRequested.type = ENGINE_PASS_REQUESTED;

/** The HUD's review control: run a pass now and review whatever is unread,
 *  whether or not the threshold has been reached. */
const ENGINE_REVIEW_REQUESTED = "engine/reviewRequested";
export const engineReviewRequested = () => ({
  type: ENGINE_REVIEW_REQUESTED as typeof ENGINE_REVIEW_REQUESTED,
  payload: undefined,
});
engineReviewRequested.type = ENGINE_REVIEW_REQUESTED;

/** The watermark: how far the Engine has read — which section, and how much of
 *  it — or null in a story it has never looked at.
 *
 *  Anything that is not that shape reads as null, which re-reads the story. The
 *  0.15 alpha wrote a bare section id (Story Engine is alpha, so there is no
 *  migration); a bare number therefore lands on the same path a dangling
 *  watermark already takes, and costs input tokens rather than skipped prose. */
function readWatermark(value: unknown): Watermark | null {
  if (typeof value !== "object" || value === null) return null;
  const { sectionId, offset } = value as Partial<Watermark>;
  return typeof sectionId === "number" && typeof offset === "number"
    ? { sectionId, offset }
    : null;
}

/** The intent kinds this build can run. A record written by an older build may
 *  hold others (`open`, `retire`); they are dropped here, at the one door
 *  persisted intents come through, so the drain's exhaustive switch never meets
 *  a kind it has no arm for. */
const KNOWN_KINDS: ReadonlySet<string> = new Set([
  "revise",
  "condense",
  "threadWrite",
  "admit",
  "conclude",
]);

/** The queue. Persisted JSON is trusted no further than its shape: a missing or
 *  malformed record reads as an empty queue rather than throwing inside the
 *  pass it was meant to feed.
 *
 *  **The element-level check on the prose a text-dependent intent must carry**
 *  is here because this is the only door persisted intents come through —
 *  `parseTriage` always attaches it, so a `revise` arriving without one was
 *  written by an older build or by a hand-edited record. Dropping it is the
 *  safe direction and the only honest one: the alternative is running a full
 *  entry rewrite on whatever prose the running pass happens to hold, which is
 *  precisely the failure the field exists to prevent. The work is lost, and
 *  losing it costs the writer nothing they can see — triage names an entry the
 *  story has made wrong again the next time the story says so. */
function readQueue(value: unknown): Intent[] {
  if (!Array.isArray(value)) return [];
  return (value as Intent[]).filter(
    (intent) =>
      KNOWN_KINDS.has(intent?.kind) &&
      (intent.kind === "condense" ||
        (typeof intent.prose === "string" && intent.prose.length > 0)),
  );
}

/** The loop's one record, hydrated. Both halves default independently, so a
 *  record holding a usable watermark and a corrupt queue keeps the watermark. */
async function readEngineRecord(): Promise<EngineRecord> {
  const stored: unknown = await api.v1.storyStorage.get(ENGINE_LOOP_KEY);
  const record = (
    typeof stored === "object" && stored !== null ? stored : {}
  ) as Partial<EngineRecord>;
  return {
    watermark: readWatermark(record.watermark),
    reviewWatermark: readWatermark(record.reviewWatermark),
    queue: readQueue(record.queue),
  };
}

async function saveEngineRecord(record: EngineRecord): Promise<void> {
  await api.v1.storyStorage.set(ENGINE_LOOP_KEY, record);
}

/** What triage is allowed to name: the entities the new prose plausibly
 *  mentions.
 *
 *  NOT every live entity. Assess is deliberately generous and triage's
 *  precision is what makes that affordable; a manifest of the whole World would
 *  grow the stable prefix without bound and cost input tokens on every pass
 *  forever. The trade is real in the other direction too — `parseTriage` drops
 *  any name the manifest does not list, so what is left out here is what triage
 *  can never say. */
function buildManifest(
  state: RootState,
  candidateIds: string[],
): TriageManifest {
  const label = (entity: WorldEntity): string =>
    FIELD_CONFIGS.find((c) => c.id === entity.categoryId)?.label ?? "";

  const entities = candidateIds
    .map((id) => state.world.entitiesById[id])
    .filter((entity): entity is WorldEntity => entity !== undefined)
    .map((entity) => ({
      id: entity.id,
      name: entity.name,
      category: label(entity),
      summary: entity.summary,
    }));

  return { entities };
}

/** §5.1's trigger: the one entry, if any, this pass should offer to condense.
 *
 *  Free — no generation, just a lorebook read and some arithmetic — which is
 *  the whole reason the intent is enqueued here rather than proposed by triage.
 *  Three decisions are worth stating, because each one is a way this goes
 *  wrong:
 *
 *  **Only entries the Engine manages.** An oversized lorebook entry no entity
 *  of ours is bound to is the writer's own document; it is not sprawl the
 *  Engine's revisions created, and rewriting it is not something switching the
 *  loop on asks for. Disabled entries are skipped too: they inject nothing, so
 *  compacting one is a lossy rewrite with nothing to gain (§5.1's whole case is
 *  the context a bloated entry crowds out).
 *
 *  **At most one per pass.** §3.3 affords one entry rewrite per pass, so
 *  enqueueing every oversized entry at once would not condense them any faster
 *  — it would leave the NEXT pass's revise queued behind a FIFO backlog of
 *  maintenance work for as many passes as there are long entries. The
 *  counterweight would starve the revisions it is a counterweight to. The
 *  longest entry is the one taken, being the one costing the most context; the
 *  rest are found again next pass, and §3.3 is explicit that a queued action is
 *  safe indefinitely.
 *
 *  **The mark, not just the length.** The trigger is otherwise memoryless, and
 *  an entry whose facts genuinely do not fit under the threshold would be
 *  offered on every pass forever. `worthCondensing` wants a paragraph of growth
 *  since the last attempt — and the walk continues past a blocked entry rather
 *  than stopping, or the largest permanently-blocked entry would hide every
 *  other one behind it. */
async function nextCondense(
  state: RootState,
  thresholdChars: number,
): Promise<Intent[]> {
  const managed = new Set(
    Object.values(state.world.entitiesById)
      .map((entity) => entity.lorebookEntryId)
      .filter((id): id is string => id !== undefined),
  );
  if (managed.size === 0) return [];

  const sizes: EntrySize[] = (await api.v1.lorebook.entries())
    .filter((entry) => managed.has(entry.id) && entry.enabled !== false)
    .map((entry) => ({ entryId: entry.id, length: (entry.text ?? "").length }));

  for (const size of oversizedEntries(sizes, thresholdChars)) {
    const mark = await readCondenseMark(size.entryId);
    if (worthCondensing(size.length, mark)) {
      return [{ kind: "condense", entryId: size.entryId }];
    }
  }
  return [];
}

/** One generation a pass spends, with the bounded backoff from §3.4. Triage and
 *  the review share it: both are background calls that hand a collision back to
 *  the next wakeup rather than wait on it.
 *
 *  Attempts are numbered from 1 (refusal.ts's contract): `backoffMs(0)` is null,
 *  so a loop counting from 0 would perform no retries at all instead of failing
 *  loudly.
 *
 *  `maxRetries: 0` is not a detail. GenX's own transient-error handler treats
 *  "in progress" as retryable and would otherwise sit on the refusal for five
 *  attempts of exponential backoff — over a minute of a pass holding its node
 *  and its re-entry guard, inside a loop whose whole retry policy is supposed to
 *  be "a few hundred milliseconds, then hand the work back to the next wakeup". */
async function generateWithBackoff(
  genX: GenX,
  factory: MessageFactory,
  baseParams: GenerationParams,
  label: string,
  log: EngineLog,
): Promise<string> {
  // `fastRejection` (GenX 0.5.0): refuse rather than queue or park. §3.5 says a
  // background loop must not demand a Continue click, and GenX's parked status
  // is instance-wide — one held Engine call flags the whole queue, which the
  // header renders as a Continue widget for work the writer never asked for.
  // Rejecting instead hands the decision back here, where the next wakeup is
  // the retry. `maxRetries: 0` is now GenX's own default for such a task; it
  // stays explicit because the reason is ours (see the revise arm).
  const params = { ...baseParams, maxRetries: 0, fastRejection: true };

  for (let attempt = 1; ; attempt++) {
    try {
      const response = await genX.generate(
        factory,
        { ...params, taskId: `engine-${label}-${api.v1.uuid()}` },
        undefined,
        "background",
        // No cancellation signal. One is only worth creating when something can
        // cancel it, and nothing does this phase — the plan lists
        // createCancellationSignal as out of scope, and a signal created per
        // attempt that no one holds is weight, not a capability. §3.4 wants it
        // for the writer explicitly stopping the Engine, which arrives with the
        // actions that are expensive enough to be worth stopping.
      );
      return response.choices?.[0]?.text ?? "";
    } catch (error) {
      // Only a recognised collision is worth waiting on. Everything else —
      // recognised or not — is handed to the caller, which asks the same
      // classifier what to tell the machine.
      const wait = isConcurrencyRefusal(error) ? backoffMs(attempt) : null;
      if (wait === null) throw error;
      await log(
        `[engine] ${label} refused, retry ${attempt}/${MAX_ATTEMPTS - 1} in ${wait}ms`,
      );
      await api.v1.timers.sleep(wait);
    }
  }
}

/** A review decision as the intent the drain runs. Each carries the window the
 *  review read, for the reason `revise` carries its prose. */
function toIntent(decision: ReviewDecision, prose: string): Intent {
  switch (decision.kind) {
    case "update":
      return { kind: "threadWrite", threadId: decision.threadId, prose };
    case "conclude":
      return { kind: "conclude", threadId: decision.threadId, prose };
    case "admit":
      return {
        kind: "admit",
        title: decision.title,
        entityIds: decision.entityIds,
        prose,
      };
  }
}

/** The review step: one generation over a scene's worth of unread prose, read
 *  into intents. Returns null when the review did not happen, so the caller
 *  leaves the review watermark where it was and the same prose is offered
 *  again.
 *
 *  **It never fails the pass.** By the time this runs triage has answered, and
 *  an exception here would throw that answer away with the watermark unsaved.
 *  A short bucket, a collision with the writer and a budget hold are all
 *  routine; each skips the review and lets the pass finish. Anything else is a
 *  real fault and is rethrown for the pass to classify.
 *
 *  Open Thread entries are re-synced first: a member's lorebook keys are edited
 *  outside the store, and this bounds how long a condition can lag them. */
async function runReview(
  deps: EngineLoopDeps,
  window: ReviewWindow,
  settings: EngineSettings,
  log: EngineLog,
): Promise<Intent[] | null> {
  const { genX, getState } = deps;

  // The call itself, plus the reserve every Engine spend leaves for the next
  // triage.
  if (
    api.v1.script.getAllowedOutput() <
    REVIEW_MAX_TOKENS + TRIAGE_MAX_TOKENS
  ) {
    await log("[engine] review due, budget short — left for the next pass");
    return null;
  }

  await syncOpenThreadEntries(getState);

  const state = getState();
  const aliases = await entityAliases(state, state.world.entityIds);
  const label = (entity: WorldEntity): string =>
    FIELD_CONFIGS.find((c) => c.id === entity.categoryId)?.label ?? "";
  const manifest = buildReviewManifest({
    foundation: formatFoundationBlock(state),
    entities: Object.values(state.world.entitiesById).map((entity) => ({
      id: entity.id,
      name: entity.name,
      category: label(entity),
      summary: entity.summary,
    })),
    threads: state.world.threads,
    aliases,
    paragraphs: window.paragraphs,
  });

  let text: string;
  try {
    text = await generateWithBackoff(
      genX,
      createReviewFactory(manifest, window.paragraphs),
      await reviewParams(),
      "review",
      log,
    );
  } catch (error) {
    if (!isConcurrencyRefusal(error) && !isBudgetHold(error)) throw error;
    await log("[engine] review could not run — left for the next pass");
    return null;
  }

  const { accepted, refused } = applyFloors(parseReview(text, manifest), {
    threads: state.world.threads,
    paragraphs: window.paragraphs,
    aliases,
    threadCap: settings.threadCap,
  });
  for (const { decision, reason } of refused) {
    await log(
      `[engine] review: refused ${decision.kind}${
        decision.kind === "admit" ? ` "${decision.title}"` : ""
      } — ${reason}`,
    );
  }

  const prose = window.paragraphs.join("\n\n");
  return accepted.map((decision) => toIntent(decision, prose));
}

/** Build the pass, with its own re-entry guard.
 *
 *  The guard is a closure variable rather than a module global (CLAUDE.md: no
 *  singletons) and it is claimed synchronously, before the first await —
 *  `canStartPass` alone cannot cover the window between reading the document
 *  and the machine leaving `idle`, and `disabled` on the ⚡ covers nothing at
 *  all. Both entry points, the wakeup and the ⚡, share this one runner.
 *
 *  Exported for tests: the pass is worth driving directly, without a hook
 *  registration in the way. */
export function createEnginePass(
  deps: EngineLoopDeps,
): (options?: { forceReview?: boolean }) => Promise<void> {
  const { dispatch, getState, genX } = deps;
  const log = createEngineLog();
  let inFlight = false;

  return async function runPass(
    options: { forceReview?: boolean } = {},
  ): Promise<void> {
    if (inFlight) return;
    // The machine's own answer to "may a pass start", checked here rather than
    // in whatever pressed the button.
    if (!canStartPass(getState().engine)) return;
    inFlight = true;

    try {
      const settings = await readEngineSettings();
      // Mirrored on EVERY pass, not only the refusing one: the store is what the
      // HUD and the Setup form render from, and a story opened in a second tab —
      // or edited from the form and then reloaded — has settings the store has
      // never seen. Identity-checked in the reducer, so an unchanged read costs
      // no repaint.
      dispatch(engineSettingsChanged(settings));

      // The single home of "off means off". Checked here rather than at each
      // entry point because there are two — the wakeup timer and the ⚡ — and a
      // rule with two homes is a rule that will end up with one.
      //
      // The timer path needs it because `enabled` is read when the wakeup is
      // ARMED: a writer who generates and then switches the Engine off inside
      // the delay window would otherwise still get a full pass, triage
      // generation included. The ⚡ needs it because §9.1 says it bypasses the
      // *wakeup*, not the writer's decision to switch the Engine off.
      if (!settings.enabled) return;
      const { minProse } = settings;
      const [{ watermark, reviewWatermark, queue }, sections] =
        await Promise.all([readEngineRecord(), api.v1.document.scan()]);

      const sectionIds = sections.map((s) => s.sectionId);
      const textBySection = new Map(
        sections.map((s) => [s.sectionId, s.section.text]),
      );
      const assessment = assess({
        sectionIds,
        watermark,
        textBySection,
        entities: Object.values(getState().world.entitiesById),
      });

      // The review pass's own reading of the same scan. It trails the fast
      // pass: its watermark moves only when a review completes.
      const window = reviewWindow({
        sectionIds,
        watermark: reviewWatermark,
        textBySection,
      });
      dispatch(engineReviewBacklogObserved({ backlog: window.backlog }));
      const reviewDue =
        window.paragraphs.length > 0 &&
        (options.forceReview === true ||
          window.backlog >= settings.reviewEvery);

      // Measured from the SAME scan assess just read, not from a later one.
      // The offset's whole job is to say how much of that section this pass
      // saw; re-reading the document to compute it would silently mark prose
      // written during triage as read.
      const reached = sections[sections.length - 1];

      // Rule 2. A positive backlog under the threshold is real unread prose:
      // report it, start nothing, spend nothing. At the default of 1 this is a
      // no-op and a genuinely empty backlog falls through to the machine, which
      // ends the pass at `assessed` having generated nothing. A due review
      // still runs — it reads at its own threshold, not triage's.
      const belowMinimum =
        assessment.backlog > 0 && assessment.backlog < minProse;
      if (belowMinimum) {
        dispatch(engineBacklogObserved({ backlog: assessment.backlog }));
        await log(
          `[engine] ${assessment.backlog} new paragraph(s), below the minimum of ${minProse} — skipping`,
        );
        if (!reviewDue) return;
      }
      const triageNow = assessment.backlog > 0 && !belowMinimum;

      dispatch(engineLoopEvent({ type: "passRequested" }));
      dispatch(
        engineLoopEvent({
          type: "assessed",
          backlog: triageNow ? assessment.backlog : 0,
          candidateIds: assessment.candidateIds,
          reviewDue,
        }),
      );
      if (!triageNow && !reviewDue) return;

      let intents: Intent[] = [];
      let advanced = watermark;
      if (triageNow) {
        // The reserve is the triage call itself; the drain then checks the same
        // bucket again before each action it runs (`INTENT_MAX_TOKENS`, plus this
        // same reserve so the NEXT pass can still triage). Checked here rather
        // than left to GenX, which would park the pass waiting for the bucket to
        // refill instead of reporting a hold.
        //
        // **This check is output-only, and cannot be made complete here (§14.1's
        // deferred `waiting_for_user` gap).** GenX's `ensureBudget` blocks on
        // input budget as well, and when it blocks it sets its status to
        // `waiting_for_user` — which the header renders as a Continue widget, for
        // work the writer never asked for and which §3.5 says a background loop
        // has no business demanding. Four facts, read out of
        // `node_modules/nai-gen-x/src/gen-x.ts`, close every route to fixing it
        // from this side:
        //
        //   1. The park is unconditional and per-instance. `ensureBudget` ignores
        //      `behaviour`, so a background task parks exactly like a foreground
        //      one, and the status it sets belongs to the GenX instance rather
        //      than to the task — there is no per-task opt-out to pass.
        //   2. A parked task cannot be abandoned. `waitForAllowedInput` and
        //      `waitForAllowedOutput` take no cancellation signal, and GenX only
        //      re-reads `signal.cancelled` after they resolve; `cancelQueued` is a
        //      no-op once the task is the one executing. §3.5 wants the work
        //      abandoned, and abandoning it is exactly what is unavailable.
        //   3. The one lever, `userInteraction()`, relabels rather than unparks —
        //      `waiting_for_user` becomes `waiting_for_budget` and the same await
        //      continues. (The loop already forwards it on every writer
        //      generation, below, so the widget does clear when the writer
        //      generates — which is also the only thing that refills the bucket.)
        //   4. A pre-check here cannot predict the park either, which is what
        //      rules out the obvious patch. GenX compares the TOTAL input tokens
        //      (`Σ tokenizer.encode`) against `getAllowedInput()`, which is the
        //      UNCACHED allowance. Any reserve we compute must either reproduce
        //      that mismatch — inheriting spurious holds on a prefix the backend
        //      has cached, on every pass, forever — or measure the honest
        //      `countUncachedInputTokens` and fail to predict GenX at all.
        //
        // So §14.1's framing ("a question about how the Engine's tasks are queued
        // in GenX rather than a patch to the pass") has no answer at the queuing
        // layer: the only queuing-level fix is a second GenX instance whose state
        // is never mirrored into the store, which would cost the serialisation
        // that currently keeps the Engine from colliding with SEGA and the Forge,
        // and would put a second `onGenerationRequested` registration in a
        // codebase where one callback per hook name has already bitten us twice.
        // Closing this needs an upstream change — a per-task "do not park" that
        // rejects instead of waiting — and until then the residual is a Continue
        // widget that appears only while the Engine is genuinely blocked, clears
        // on the writer's next generation, and does the right thing if pressed.
        // Revisit on any nai-gen-x upgrade.
        if (api.v1.script.getAllowedOutput() < TRIAGE_MAX_TOKENS) {
          dispatch(engineLoopEvent({ type: "budgetExhausted" }));
          await log("[engine] holding — budget below the triage reserve");
          return;
        }

        const manifest = buildManifest(getState(), assessment.candidateIds);
        intents = parseTriage(
          await generateWithBackoff(
            genX,
            createTriageFactory({ manifest, assessment }),
            await triageParams(),
            "triage",
            log,
          ),
          manifest,
          // The prose that raised whatever triage just named, carried on the
          // intents whose input it is. A `revise` the budget defers
          // runs on a later pass, past a watermark that has already moved — see
          // `Intent` in loop-machine.ts.
          assessment.newText,
        );
        // Rule 1: triage got its answer, so the prose behind it has been read.
        advanced = {
          sectionId: reached.sectionId,
          offset: reached.section.text.length,
        };
      }

      // The slow read, after the fast one. It moves its own watermark and only
      // when it actually ran.
      let reviewed = reviewWatermark;
      let reviewIntents: Intent[] = [];
      if (reviewDue) {
        const outcome = await runReview(deps, window, settings, log);
        if (outcome) {
          reviewIntents = outcome;
          reviewed = window.reached;
          dispatch(
            engineReviewBacklogObserved({
              backlog: window.backlog - window.paragraphs.length,
            }),
          );
        }
      }

      // §5.1's condense, appended AFTER what triage named rather than before
      // it. Both cost 1024 and the drain is FIFO among costly intents, so the
      // order here decides which one a pass with room for exactly one rewrite
      // spends it on — and a revise records something the story has just made
      // true, while a condense tidies something that has been long for a while
      // and will still be long next pass.
      const condense = await nextCondense(getState(), settings.condenseAtChars);

      // What the pass is about to act on: what triage just named, PLUS anything
      // an earlier pass deferred for budget. The machine is told this rather
      // than `intents` alone, and it has to be: once the drain can defer, a
      // pass that triaged nothing new may still owe a rewrite, and feeding the
      // machine the empty `intents` would leave the HUD reading `idle` through
      // a drain that is editing the writer's lorebook. `acting` is the one
      // phase §9.1 spends the pencil on, so it must not be skipped.
      // Triage's revises first, then the review's Thread work, then the
      // condense: the drain is FIFO among costly intents, and an entity record
      // the story has just made wrong outranks tidying.
      const enqueued = dedupe(queue, [
        ...intents,
        ...reviewIntents,
        ...condense,
      ]);
      dispatch(engineLoopEvent({ type: "triaged", intents: enqueued }));

      // Rule 4: one record, so the watermarks and the queue they were triaged
      // from are written together.
      await saveEngineRecord({
        watermark: advanced,
        reviewWatermark: reviewed,
        queue: enqueued,
      });

      if (enqueued.length === 0) return;

      // Drain: execute, THEN clear. The write above is what lets a reload
      // between the two find the queue rather than nothing (§11), and it is
      // why the queue is persisted before anything runs against it.
      //
      // Only what the budget could not afford is written back. Everything the
      // drain reached is forgotten, executed or not: dedupe bounds one
      // commitment's repeats, not the queue's length, so a queue that kept what
      // it could not use would grow all session. A deferred intent is the one
      // exception, and §3.3 is explicit about why — prose does not un-happen,
      // so the work is still wanted and rediscovering it would cost another
      // triage call.
      const { executed, remaining } = await drain(enqueued, {
        dispatch,
        getState,
        genX,
        log,
      });
      await saveEngineRecord({
        watermark: advanced,
        reviewWatermark: reviewed,
        queue: remaining,
      });

      // §9.1's ∆, and the first phase in which it can be anything but zero.
      // Dispatched before the resting event rather than folded into it: a drain
      // that revised something AND ran out of budget reports `budgetExhausted`,
      // so a count carried on `drained` alone would be lost exactly when the
      // Engine was busiest.
      const revised = revisionsIn(executed);
      if (revised > 0)
        dispatch(engineLoopEvent({ type: "revised", count: revised }));

      // A drain that ran out of budget mid-queue is `held`, not done: §9.1's
      // ⏸ says "the budget cannot cover the next step", which is exactly what
      // happened, and `held` is a resting phase so the next wakeup tries again.
      dispatch(
        engineLoopEvent(
          remaining.length > 0
            ? { type: "budgetExhausted" }
            : { type: "drained" },
        ),
      );
    } catch (error) {
      // A budget hold is not a failure. GenX's `fastRejection` refuses rather
      // than parking (§3.5), and "the bucket could not cover this" is exactly
      // what §9.1's ⏸ says — a resting phase the next wakeup retries — where
      // `failed` lights the ⚠ that means something is wrong. Reporting a
      // routine hold as a failure would put a warning on the always-on surface
      // every time the writer ran SEGA.
      if (isBudgetHold(error)) {
        dispatch(engineLoopEvent({ type: "budgetExhausted" }));
        await log("[engine] holding — GenX declined for budget");
        return;
      }

      // Rule 3. The classifier decides, not this callsite. A budget hold has
      // already returned above, so a collision is the only routine outcome that
      // can still reach here — asking a broader question would be generality
      // no input can exercise.
      const retryable = isConcurrencyRefusal(error);
      // The machine first, the account of it second: the HUD is the always-on
      // surface and the log is opt-in, so nothing the log does may come between
      // a failure and the slot that reports it.
      dispatch(engineLoopEvent({ type: "failed", retryable }));
      await log(
        `[engine] pass failed (retryable=${retryable}):`,
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      // Released even on the paths that return early, or the Engine would wake
      // exactly once per session.
      inFlight = false;
    }
  };
}

export function registerEngineLoopEffects(deps: EngineLoopDeps): void {
  const runPass = createEnginePass(deps);

  // Read the setting once at startup. Without this the slice's `enabled: false`
  // stands until the writer generates or presses ⚡ — so someone who opted in
  // opens their story and reads "Off — the Engine is not running", which is a
  // glyph and a tooltip asserting a fact that is not true. Fire-and-forget: the
  // HUD repaints from the store when it lands.
  void readEngineSettings().then((settings) => {
    deps.dispatch(engineSettingsChanged(settings));
  });

  // The review control. Same runner, same guards; it only asks the pass to
  // review whatever is unread without waiting for the threshold.
  deps.subscribeEffect(matchesAction(engineReviewRequested), async () => {
    await runPass({ forceReview: true });
  });

  // The ⚡. Both of its guards live inside runPass: the in-flight/canStartPass
  // check, because a press arriving before the re-render that would disable the
  // button still reaches here; and the enabled check, so off means off for the
  // manual control too.
  deps.subscribeEffect(matchesAction(enginePassRequested), async () => {
    await runPass();
  });

  // True from the moment a wakeup is armed until it fires. The window closes
  // when the pass STARTS, not when it finishes: "at most once per delay window"
  // is a statement about the timer, and a pass that outlives its own window has
  // the pass's own canStartPass and in-flight guards underneath it. Holding the
  // flag across the pass instead would drop wakeups for prose written while it
  // ran.
  let pending = false;

  api.v1.hooks.register(
    "onGenerationRequested",
    async ({ scriptInitiated }) => {
      // The Engine's own generations must not wake the Engine.
      if (scriptInitiated) return;

      // GenX registers this same hook in its constructor to notice the writer
      // generating and unpark a task waiting on the budget — and one callback
      // per hook name means this registration silently replaced it. Forward the
      // call rather than leave a script generation parked until someone finds
      // the header's Continue button. Ahead of the `pending` check on purpose:
      // every user generation is a user interaction, not just the first of a
      // burst.
      deps.genX.userInteraction();

      // Claimed BEFORE the settings read, not after: two generations dispatched
      // in the same tick both reach the await, and a flag set on the far side
      // of it would arm two wakeups for one burst.
      if (pending) return;
      pending = true;

      const settings = await readEngineSettings();
      // Mirror them so the HUD's state slot can say "off" rather than reading
      // identically to idle, and so the Setup form shows what is actually
      // stored rather than the defaults the slice started at.
      deps.dispatch(engineSettingsChanged(settings));
      if (!settings.enabled) {
        pending = false;
        return;
      }

      void api.v1.timers.setTimeout(async () => {
        pending = false;
        await runPass();
      }, settings.delayMs);
    },
  );
}
