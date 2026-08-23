// The Engine's loop: the single onGenerationRequested registration, and the
// pass that registration wakes.
//
// api.v1.hooks.register holds ONE callback per hook name, so this is the only
// place in the codebase that may register this hook — a second registration
// anywhere silently replaces this one and the Engine simply stops waking, with
// nothing in the UI to explain it. Guarded by a source scan in
// tests/core/engine/trigger.test.ts, the same way history-sync.ts guards
// onHistoryNavigated, plus a wiring guard: the source scan alone passes just as
// happily when nothing calls registerEngineLoopEffects at all.
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
import type { GenX } from "nai-gen-x";
import type { AppDispatch, RootState, WorldEntity } from "../types";
import { assess, type Watermark } from "../../engine/assess";
import { readEngineSettings } from "../../engine/settings";
import { canStartPass, type Intent } from "../../engine/loop-machine";
import { dedupe, QUEUE_KEY, WATERMARK_KEY } from "../../engine/intents";
import { drain } from "../../engine/execute";
import {
  backoffMs,
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
import { captureNode, saveRecords } from "../persistence/history-store";
import {
  engineBacklogObserved,
  engineLoopEvent,
  engineSettingsChanged,
} from "../slices/engine";
import { FIELD_CONFIGS } from "../../../config/field-definitions";

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
//   4. `watermark` and `queue` are two records, never one blob — historyStorage
//      is copy-on-write per key per node (§6.2), the watermark moves every pass
//      and the queue usually does not, and merging them would snapshot the
//      queue onto every node the watermark touches.
//   5. The node is captured at the START of the pass and passed to every write
//      (§6.3). Triage takes seconds, the writer keeps typing, and a `set()`
//      without an explicit node has been measured landing two nodes away.

/** The Engine's account of itself, behind `story_engine_debug`.
 *
 *  §9.1's HUD is the always-on surface; these lines are the detail behind it, and
 *  with the flag off the Engine is silent.
 *
 *  This flag gates ONLY Story Engine's own output. nai-store's dispatch firehose
 *  has its own switch (`store_action_log`, see `core/store/index.ts`) because the
 *  two shared one at first, and sharing meant reading what the Engine decided
 *  required turning on many lines per keystroke that buried it.
 *
 *  **Read once, where the pass is built.** `api.v1.config` is read-only and a
 *  `project.yaml` entry cannot change mid-session, so a read per line would ask
 *  the same question five times a pass and answer it identically. The promise is
 *  the read; every line awaits the same one. */
type EngineLog = (...messages: unknown[]) => Promise<void>;

function createEngineLog(): EngineLog {
  const debug: Promise<boolean> = api.v1.config
    .get("story_engine_debug")
    .then((value: unknown) => value === true);

  return async (...messages) => {
    if (await debug) api.v1.log(...messages);
  };
}

/** The HUD's ⚡: run a pass now. Carries no payload — everything the pass needs
 *  it reads for itself — and is ignored while one is already running. */
const ENGINE_PASS_REQUESTED = "engine/passRequested";
export const enginePassRequested = () => ({
  type: ENGINE_PASS_REQUESTED as typeof ENGINE_PASS_REQUESTED,
  payload: undefined,
});
enginePassRequested.type = ENGINE_PASS_REQUESTED;

/** The watermark record: how far the Engine has read on this branch — which
 *  section, and how much of it — or null on a branch it has never looked at.
 *
 *  Anything that is not that shape reads as null, which re-reads the branch. The
 *  0.15 alpha wrote a bare section id here (Story Engine is alpha, so there is
 *  no migration); a bare number therefore lands on the same path a dangling
 *  watermark already takes, and costs input tokens rather than skipped prose. */
async function readWatermark(nodeId: number): Promise<Watermark | null> {
  const value: unknown = await api.v1.historyStorage.get(WATERMARK_KEY, nodeId);
  if (typeof value !== "object" || value === null) return null;
  const { sectionId, offset } = value as Partial<Watermark>;
  return typeof sectionId === "number" && typeof offset === "number"
    ? { sectionId, offset }
    : null;
}

/** The queue record. Persisted JSON is trusted no further than its shape: a
 *  missing or malformed record reads as an empty queue rather than throwing
 *  inside the pass it was meant to feed. */
async function readQueue(nodeId: number): Promise<Intent[]> {
  const value: unknown = await api.v1.historyStorage.get(QUEUE_KEY, nodeId);
  return Array.isArray(value) ? (value as Intent[]) : [];
}

/** What triage is allowed to name: the entities the new prose plausibly
 *  mentions, plus every thread the story has open.
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
  threadCap: number,
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

  // Every thread, not only the open ones, and `status` rides along rather than
  // filtering: §4.5's cap is over the whole list, so a manifest that hid the
  // satisfied ones would show triage a fill the reducer does not agree with.
  // The prompt marks them instead, which also tells the model that the cheapest
  // slot to spend is already standing (`triage-strategy.ts`).
  const threads = state.world.threads.map((thread) => ({
    id: thread.id,
    title: thread.title,
    text: thread.text,
    horizon: thread.horizon,
    status: thread.status,
  }));

  return { entities, threads, threadCap };
}

/** The one generation a pass spends, with the bounded backoff from §3.4.
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
async function generateTriage(
  genX: GenX,
  manifest: TriageManifest,
  assessment: ReturnType<typeof assess>,
  log: EngineLog,
): Promise<string> {
  const params = { ...(await triageParams()), maxRetries: 0 };

  for (let attempt = 1; ; attempt++) {
    try {
      const response = await genX.generate(
        createTriageFactory({ manifest, assessment }),
        { ...params, taskId: `engine-triage-${api.v1.uuid()}` },
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
        `[engine] triage refused, retry ${attempt}/${MAX_ATTEMPTS - 1} in ${wait}ms`,
      );
      await api.v1.timers.sleep(wait);
    }
  }
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
export function createEnginePass(deps: EngineLoopDeps): () => Promise<void> {
  const { dispatch, getState, genX } = deps;
  const log = createEngineLog();
  let inFlight = false;

  return async function runPass(): Promise<void> {
    if (inFlight) return;
    // The machine's own answer to "may a pass start", checked here rather than
    // in whatever pressed the button.
    if (!canStartPass(getState().engine)) return;
    inFlight = true;

    try {
      // Captured first, before anything that can await, and handed to every
      // write below (§6.3). Nothing else in the pass may read "current" again.
      const nodeId = await captureNode();

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
      const [watermark, queue, sections] = await Promise.all([
        readWatermark(nodeId),
        readQueue(nodeId),
        api.v1.document.scan(),
      ]);

      const sectionIds = sections.map((s) => s.sectionId);
      const assessment = assess({
        sectionIds,
        watermark,
        textBySection: new Map(
          sections.map((s) => [s.sectionId, s.section.text]),
        ),
        entities: Object.values(getState().world.entitiesById),
      });

      // Measured from the SAME scan assess just read, not from a later one.
      // The offset's whole job is to say how much of that section this pass
      // saw; re-reading the document to compute it would silently mark prose
      // written during triage as read.
      const reached = sections[sections.length - 1];

      // Rule 2. A positive backlog under the threshold is real unread prose:
      // report it, start nothing, spend nothing. At the default of 1 this is a
      // no-op and a genuinely empty backlog falls through to the machine, which
      // ends the pass at `assessed` having generated nothing.
      if (assessment.backlog > 0 && assessment.backlog < minProse) {
        dispatch(engineBacklogObserved({ backlog: assessment.backlog }));
        await log(
          `[engine] ${assessment.backlog} new paragraph(s), below the minimum of ${minProse} — skipping`,
        );
        return;
      }

      dispatch(engineLoopEvent({ type: "passRequested" }));
      dispatch(
        engineLoopEvent({
          type: "assessed",
          backlog: assessment.backlog,
          candidateIds: assessment.candidateIds,
        }),
      );
      if (assessment.backlog === 0) return;

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

      const manifest = buildManifest(
        getState(),
        assessment.candidateIds,
        settings.threadCap,
      );
      const intents = parseTriage(
        await generateTriage(genX, manifest, assessment, log),
        manifest,
      );

      // What the pass is about to act on: what triage just named, PLUS anything
      // an earlier pass deferred for budget. The machine is told this rather
      // than `intents` alone, and it has to be: once the drain can defer, a
      // pass that triaged nothing new may still owe a rewrite, and feeding the
      // machine the empty `intents` would leave the HUD reading `idle` through
      // a drain that is editing the writer's lorebook. `acting` is the one
      // phase §9.1 spends the pencil on, so it must not be skipped.
      const enqueued = dedupe(queue, intents);
      dispatch(engineLoopEvent({ type: "triaged", intents: enqueued }));

      // Rule 1: the pass got its answer, so the prose behind it has been read.
      // Rule 4: its own record, its own write.
      const advanced: Watermark = {
        sectionId: reached.sectionId,
        offset: reached.section.text.length,
      };
      await saveRecords({ [WATERMARK_KEY]: advanced }, nodeId);

      if (enqueued.length === 0) return;

      await saveRecords({ [QUEUE_KEY]: enqueued }, nodeId);

      // Drain: execute, THEN clear. The write above is what lets a reload
      // between the two find the queue rather than nothing (§11), and it is
      // why the queue is persisted before anything runs against it.
      //
      // Only what the budget could not afford is written back. Everything the
      // drain reached is forgotten, executed or not: dedupe bounds one
      // commitment's repeats, not the queue's length, so a queue that kept
      // what it could not use would grow all session and be copied onto every
      // node that writes. A deferred intent is the one exception, and §3.3 is
      // explicit about why — prose does not un-happen, so the work is still
      // wanted and rediscovering it would cost another triage call.
      const { remaining } = await drain(enqueued, {
        dispatch,
        getState,
        nodeId,
        log,
      });
      await saveRecords({ [QUEUE_KEY]: remaining }, nodeId);

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
      // Rule 3. The classifier decides, not this callsite.
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
