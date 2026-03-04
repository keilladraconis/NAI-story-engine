import { Store, matchesAction } from "nai-store";
import { RootState, AppDispatch } from "../types";
import { GenX } from "nai-gen-x";
import {
  crucibleShapeRequested,
  crucibleDirectionRequested,
  crucibleGoalsRequested,
  crucibleAddGoalRequested,
  crucibleBuildRequested,
  crucibleStopRequested,
  crucibleMergeRequested,
  crucibleReset,
  goalRemoved,
  requestCompleted,
  requestCancelled,
  expansionTriggered,
  generationSubmitted,
  requestQueued,
  goalAdded,
  phaseTransitioned,
  mergeCompleted,
  dulfsItemAdded,
  updateShape,
  directionSet,
  persistedDataLoaded,
} from "../index";
import {
  buildCrucibleShapeStrategy,
  buildCrucibleDirectionStrategy,
  buildCrucibleGoalStrategy,
} from "../../utils/crucible-strategy";
import {
  buildPrereqsStrategy,
  buildGoalElementsStrategy,
  buildExpansionStrategy,
} from "../../utils/crucible-chain-strategy";
import { extractDulfsItemName } from "../../utils/context-builder";
import { ensureCategory } from "./lorebook-sync";
import { IDS } from "../../../ui/framework/ids";
import { flushActiveEditor } from "../../../ui/framework/editable-draft";

export function registerCrucibleEffects(
  subscribeEffect: Store<RootState>["subscribeEffect"],
  dispatch: AppDispatch,
  getState: () => RootState,
  genX: GenX,
): void {
  let elementsAttempted = false;
  let buildCancelled = false;

  // --- Section collapse/expand helpers ---
  const SECTION_KEYS = {
    shape: "cr-shape-collapsed",
    direction: "cr-direction-collapsed",
    goals: "cr-goals-collapsed",
  } as const;

  const setCollapsed = async (section: "shape" | "direction" | "goals", collapsed: boolean) => {
    await api.v1.storyStorage.set(SECTION_KEYS[section], collapsed);
  };

  // Expand the first empty section, collapse everything else
  const applySectionFocus = async () => {
    const s = getState();
    const hasShape = !!s.crucible.shape;
    const hasDirection = !!s.crucible.direction;
    const hasGoals = s.crucible.goals.length > 0;

    if (!hasShape) {
      await setCollapsed("shape", false);
      await setCollapsed("direction", true);
      await setCollapsed("goals", true);
    } else if (!hasDirection) {
      await setCollapsed("shape", true);
      await setCollapsed("direction", false);
      await setCollapsed("goals", true);
    } else if (!hasGoals) {
      await setCollapsed("shape", true);
      await setCollapsed("direction", true);
      await setCollapsed("goals", false);
    } else {
      await setCollapsed("shape", true);
      await setCollapsed("direction", true);
      await setCollapsed("goals", true);
    }
  };

  // After persisted data loads, sync storage keys to match loaded state
  // (components handle initial render via initialCollapsed; this ensures
  // storageKey values are correct for subsequent effect-driven transitions)
  subscribeEffect(matchesAction(persistedDataLoaded), applySectionFocus);

  // Shape completes → expand Direction (let user see shape output)
  subscribeEffect(
    matchesAction(updateShape),
    () => {
      setCollapsed("direction", false);
    },
  );

  // Direction completes → expand Goals (let user see direction output)
  subscribeEffect(
    matchesAction(directionSet),
    () => {
      setCollapsed("goals", false);
    },
  );

  // Intent: Shape Requested → queue shape generation
  subscribeEffect(
    matchesAction(crucibleShapeRequested),
    async () => {
      const prefillName = String((await api.v1.storyStorage.get("cr-shape-name")) || "").trim() || undefined;
      const strategy = buildCrucibleShapeStrategy(getState, prefillName);
      dispatch(requestQueued({ id: strategy.requestId, type: "crucibleShape", targetId: "crucible" }));
      dispatch(generationSubmitted(strategy));
    },
  );

  // Intent: Crucible Direction Requested → collapse Shape, queue direction
  subscribeEffect(
    matchesAction(crucibleDirectionRequested),
    async () => {
      setCollapsed("shape", true);

      const directionStrategy = buildCrucibleDirectionStrategy(getState);
      dispatch(requestQueued({ id: directionStrategy.requestId, type: "crucibleDirection", targetId: "crucible" }));
      dispatch(generationSubmitted(directionStrategy));
    },
  );

  // Intent: Crucible Goals Requested → sync intent, queue 3 goals (shape read at JIT time if available)
  subscribeEffect(
    matchesAction(crucibleGoalsRequested),
    async () => {
      // Flush any active EditableText editor (e.g. an unsaved direction edit)
      // so its content reaches state before we build goal context.
      await flushActiveEditor();

      // Collapse Shape & Direction — goals are the focus now
      setCollapsed("shape", true);
      setCollapsed("direction", true);

      dispatch(phaseTransitioned({ phase: "goals" }));

      for (let i = 0; i < 3; i++) {
        const goalId = api.v1.uuid();
        dispatch(goalAdded({ goal: { id: goalId, text: "", why: "", accepted: true } }));
        const goalStrategy = buildCrucibleGoalStrategy(getState, goalId);
        dispatch(requestQueued({ id: goalStrategy.requestId, type: "crucibleGoal", targetId: goalId }));
        dispatch(generationSubmitted(goalStrategy));
      }
    },
  );

  // Intent: Add Single Goal → ensure goals phase, create empty goal for manual writing
  subscribeEffect(
    matchesAction(crucibleAddGoalRequested),
    (_action, { getState: getLatest }) => {
      const state = getLatest();

      if (state.crucible.phase === "direction") {
        dispatch(phaseTransitioned({ phase: "goals" }));
      }

      dispatch(goalAdded({ goal: { id: api.v1.uuid(), text: "", why: "", accepted: true } }));
    },
  );

  // Intent: Crucible Build Requested → two-step chain pipeline (prereqs → elements)
  subscribeEffect(
    matchesAction(crucibleBuildRequested),
    async (_action, { getState: getLatest }) => {
      elementsAttempted = false;
      buildCancelled = false;

      // Collapse goals — building phase is the focus now
      setCollapsed("goals", true);

      dispatch(phaseTransitioned({ phase: "building" }));

      const state = getLatest();
      const starredGoals = state.crucible.goals.filter((g) => g.accepted);
      if (starredGoals.length === 0) {
        api.v1.log("[crucible] Build requested but no goals accepted");
        return;
      }

      api.v1.ui.updateParts([{
        id: IDS.CRUCIBLE.PROGRESS_ROOT,
        text: "Finding the heart of your story...",
      }]);

      // Queue prerequisites directly — shape-native goals are the structural endpoints
      const strategy = buildPrereqsStrategy(getState);
      dispatch(requestQueued({ id: strategy.requestId, type: "cruciblePrereqs", targetId: "crucible" }));
      dispatch(generationSubmitted(strategy));
    },
  );

  // Pipeline continuation: when a crucible request completes, advance to next step
  subscribeEffect(
    matchesAction(requestCompleted),
    async () => {
      await api.v1.timers.sleep(150);

      const state = getState();

      if (state.crucible.phase !== "building") return;
      if (state.runtime.activeRequest || state.runtime.queue.length > 0) return;

      // Cancelled: revert to goals so the user can retry
      if (buildCancelled) {
        buildCancelled = false;
        dispatch(phaseTransitioned({ phase: "goals" }));
        api.v1.ui.toast("Build cancelled — click Build World to retry", { type: "info" });
        return;
      }

      // Elements step not yet tried — queue per-goal element generation
      if (!elementsAttempted) {
        elementsAttempted = true;
        const goals = state.crucible.goals.filter((g) => g.accepted);
        api.v1.log(`[crucible] Prerequisites complete → queuing elements for ${goals.length} goals`);

        for (const goal of goals) {
          const strategy = buildGoalElementsStrategy(getState, goal.id);
          dispatch(requestQueued({ id: strategy.requestId, type: "crucibleElements", targetId: goal.id }));
          dispatch(generationSubmitted(strategy));
        }
        return;
      }

      // Elements step has run (with or without results) → review
      api.v1.log("[crucible] All steps complete → transitioning to review");
      dispatch(phaseTransitioned({ phase: "review" }));
      api.v1.ui.toast(
        state.crucible.elements.length > 0
          ? "World elements ready for review"
          : "Build complete — no elements were generated",
        { type: state.crucible.elements.length > 0 ? "success" : "info" },
      );
    },
  );

  // Intent: Expansion Triggered → queue expansion strategy (no phase change)
  subscribeEffect(
    matchesAction(expansionTriggered),
    async (action) => {
      const { elementId } = action.payload;
      const strategy = buildExpansionStrategy(getState, elementId);
      dispatch(requestQueued({
        id: strategy.requestId,
        type: "crucibleExpansion",
        targetId: elementId ?? "crucible",
      }));
      dispatch(generationSubmitted(strategy));
    },
  );

  // Intent: Crucible Stop → cancel active and queued crucible requests
  subscribeEffect(
    matchesAction(crucibleStopRequested),
    (_action, { getState: getLatest }) => {
      const state = getLatest();
      const crucibleTypes = new Set([
        "crucibleShape", "crucibleDirection", "crucibleGoal",
        "cruciblePrereqs", "crucibleElements", "crucibleExpansion",
      ]);

      // Track which goal IDs are being cancelled so we can remove them from state
      const cancelledGoalIds = new Set<string>();

      // Cancel all queued crucible requests first
      for (const req of state.runtime.queue) {
        if (crucibleTypes.has(req.type)) {
          if (req.type === "crucibleGoal") cancelledGoalIds.add(req.targetId);
          dispatch(requestCancelled({ requestId: req.id }));
          genX.cancelQueued(req.id);
        }
      }

      // Cancel the active request
      const activeRequest = state.runtime.activeRequest;
      if (activeRequest && crucibleTypes.has(activeRequest.type)) {
        if (activeRequest.type === "crucibleGoal") cancelledGoalIds.add(activeRequest.targetId);
        dispatch(requestCancelled({ requestId: activeRequest.id }));
        genX.cancelAll();
      }

      // Remove goals that were mid-generation — they're empty or partial and unrecoverable
      for (const goalId of cancelledGoalIds) {
        dispatch(goalRemoved({ goalId }));
      }
    },
  );

  // Intent: Crucible Reset → clean up cr- storyStorage keys, re-focus on Shape
  subscribeEffect(
    matchesAction(crucibleReset),
    async () => {
      const allKeys = await api.v1.storyStorage.list();
      for (const key of allKeys) {
        if (key.startsWith("cr-")) {
          await api.v1.storyStorage.remove(key);
        }
      }

      api.v1.ui.updateParts([
        { id: `${IDS.CRUCIBLE.DIRECTION_TEXT}-view`, text: "" },
      ]);

      // State is now empty — expand Shape, collapse others
      await applySectionFocus();
    },
  );

  // Intent: Goal Removed → clean up goal storyStorage keys
  subscribeEffect(
    matchesAction(goalRemoved),
    async (action) => {
      const { goalId } = action.payload;
      const allKeys = await api.v1.storyStorage.list();
      for (const key of allKeys) {
        if (
          key === `cr-goal-${goalId}` ||
          key === `cr-goal-section-${goalId}`
        ) {
          await api.v1.storyStorage.remove(key);
        }
      }
    },
  );

  // Intent: Crucible Merge → write elements to World Entries
  subscribeEffect(
    matchesAction(crucibleMergeRequested),
    async (_action, { getState: getLatest }) => {
      const state = getLatest();
      const { elements } = state.crucible;
      if (elements.length === 0) {
        api.v1.log("[crucible] Merge requested but no elements");
        api.v1.ui.toast("No world elements to merge", { type: "info" });
        return;
      }

      // Pre-create categories sequentially to avoid races in concurrent dulfsItemAdded handlers
      const uniqueFieldIds = [...new Set(elements.map((el) => el.fieldId))];
      for (const fieldId of uniqueFieldIds) {
        await ensureCategory(fieldId);
      }

      let created = 0;
      let updated = 0;
      for (const el of elements) {
        const content = el.content ? `${el.name}: ${el.content}` : el.name;
        const existingItem = getLatest().story.dulfs[el.fieldId]?.find((item) => item.id === el.id);

        await api.v1.storyStorage.set(`dulfs-item-${el.id}`, content);
        if (existingItem) {
          // Upsert: sync lorebook display name to match updated content
          const name = extractDulfsItemName(content, el.fieldId);
          await api.v1.lorebook.updateEntry(el.id, { displayName: name });
          updated++;
        } else {
          dispatch(dulfsItemAdded({ fieldId: el.fieldId, item: { id: el.id, fieldId: el.fieldId } }));
          created++;
        }
      }

      dispatch(mergeCompleted());
      const parts = [created && `${created} created`, updated && `${updated} updated`].filter(Boolean);
      const msg = parts.join(", ") || "no changes";
      api.v1.log(`[crucible] Merged to World Entries: ${msg}`);
      api.v1.ui.toast(`Merged to World Entries: ${msg}`, { type: "success" });
    },
  );

  // Track cancellations during building phase so requestCompleted can revert to goals
  subscribeEffect(
    matchesAction(requestCancelled),
    (action) => {
      const state = getState();
      if (state.crucible.phase !== "building") return;

      const { requestId } = action.payload;
      const crucibleTypes = new Set([
        "crucibleGoal", "cruciblePrereqs",
        "crucibleElements", "crucibleExpansion",
      ]);
      const matchesActive = state.runtime.activeRequest?.id === requestId &&
        crucibleTypes.has(state.runtime.activeRequest?.type || "");
      const matchesQueued = state.runtime.queue.some(
        (r) => r.id === requestId && crucibleTypes.has(r.type),
      );
      if (matchesActive || matchesQueued) {
        buildCancelled = true;
        api.v1.log("[crucible] Pipeline cancellation detected — will revert to goals phase");
      }
    },
  );
}
