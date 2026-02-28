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
  directionSet,
  goalAdded,
  phaseTransitioned,
  mergeCompleted,
  dulfsItemAdded,
} from "../index";
import {
  buildCrucibleShapeStrategy,
  buildCrucibleDirectionStrategy,
  buildCrucibleGoalStrategy,
} from "../../utils/crucible-strategy";
import {
  buildPrereqsStrategy,
  buildElementsStrategy,
  buildExpansionStrategy,
} from "../../utils/crucible-chain-strategy";
import { extractDulfsItemName } from "../../utils/context-builder";
import { ensureCategory } from "./lorebook-sync";
import { IDS } from "../../../ui/framework/ids";

export function registerCrucibleEffects(
  subscribeEffect: Store<RootState>["subscribeEffect"],
  dispatch: AppDispatch,
  getState: () => RootState,
  genX: GenX,
): void {
  // Intent: Shape Requested → queue shape generation
  subscribeEffect(
    matchesAction(crucibleShapeRequested),
    async () => {
      const strategy = buildCrucibleShapeStrategy(getState);
      dispatch(requestQueued({ id: strategy.requestId, type: "crucibleShape", targetId: "crucible" }));
      dispatch(generationSubmitted(strategy));
    },
  );

  // Intent: Crucible Direction Requested → queue direction (reads shape from state at JIT time if available)
  subscribeEffect(
    matchesAction(crucibleDirectionRequested),
    async () => {
      const directionStrategy = buildCrucibleDirectionStrategy(getState);
      dispatch(requestQueued({ id: directionStrategy.requestId, type: "crucibleDirection", targetId: "crucible" }));
      dispatch(generationSubmitted(directionStrategy));
    },
  );

  // Intent: Crucible Goals Requested → sync intent, queue 3 goals (shape read at JIT time if available)
  subscribeEffect(
    matchesAction(crucibleGoalsRequested),
    async () => {
      const editedDirection = String(
        (await api.v1.storyStorage.get("cr-direction")) || "",
      );
      if (editedDirection) {
        dispatch(directionSet({ direction: editedDirection }));
      }

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

  // Intent: Add Single Goal → ensure goals phase, create goal
  subscribeEffect(
    matchesAction(crucibleAddGoalRequested),
    async (_action, { getState: getLatest }) => {
      const state = getLatest();

      if (state.crucible.phase === "direction") {
        dispatch(phaseTransitioned({ phase: "goals" }));
      }

      const goalId = api.v1.uuid();
      dispatch(goalAdded({ goal: { id: goalId, text: "", why: "", accepted: true } }));
      const goalStrategy = buildCrucibleGoalStrategy(getState, goalId);
      dispatch(requestQueued({ id: goalStrategy.requestId, type: "crucibleGoal", targetId: goalId }));
      dispatch(generationSubmitted(goalStrategy));
    },
  );

  // Intent: Crucible Build Requested → two-step chain pipeline (prereqs → elements)
  subscribeEffect(
    matchesAction(crucibleBuildRequested),
    async (_action, { getState: getLatest }) => {
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

      if (state.crucible.elements.length === 0) {
        // Step 2: Queue world elements
        api.v1.log("[crucible] Prerequisites complete → queuing world elements");
        const strategy = buildElementsStrategy(getState);
        dispatch(requestQueued({ id: strategy.requestId, type: "crucibleElements", targetId: "crucible" }));
        dispatch(generationSubmitted(strategy));
        return;
      }

      // All steps complete → transition to review
      api.v1.log("[crucible] All steps complete → transitioning to review");
      dispatch(phaseTransitioned({ phase: "review" }));
      api.v1.ui.toast("World elements ready for review", { type: "success" });
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

  // Intent: Crucible Stop → cancel active crucible request
  subscribeEffect(
    matchesAction(crucibleStopRequested),
    (_action, { getState: getLatest }) => {
      const state = getLatest();
      const activeRequest = state.runtime.activeRequest;
      const crucibleTypes = new Set([
        "crucibleShape", "crucibleDirection", "crucibleGoal",
        "cruciblePrereqs", "crucibleElements", "crucibleExpansion",
      ]);
      if (activeRequest && crucibleTypes.has(activeRequest.type)) {
        dispatch(requestCancelled({ requestId: activeRequest.id }));
        genX.cancelAll();
      }
    },
  );

  // Intent: Crucible Reset → clean up cr- storyStorage keys
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

  // Intent: Crucible Merge → write elements to DULFS
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
      api.v1.log(`[crucible] Merged to DULFS: ${msg}`);
      api.v1.ui.toast(`Merged to DULFS: ${msg}`, { type: "success" });
    },
  );

  // Stop crucible pipeline on cancellation
  subscribeEffect(
    matchesAction(requestCancelled),
    (action) => {
      const state = getState();
      if (state.crucible.phase !== "building") return;

      const { requestId } = action.payload;
      const crucibleTypes = new Set([
        "crucibleStructuralGoal", "cruciblePrereqs",
        "crucibleElements", "crucibleExpansion",
      ]);
      if (
        state.runtime.activeRequest?.id === requestId &&
        crucibleTypes.has(state.runtime.activeRequest?.type || "")
      ) {
        api.v1.log("[crucible] Pipeline cancelled, staying in current phase for retry");
      }
    },
  );
}
