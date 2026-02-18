import { createSlice } from "nai-store";
import {
  CrucibleState,
  CrucibleGoal,
  CrucibleScene,
  CrucibleChain,
  CrucibleBuilderState,
  Constraint,
  DirectorGuidance,
} from "../types";
import { DulfsFieldID } from "../../../config/field-definitions";
import { parseTagAll } from "../../utils/tag-parser";

const EMPTY_BUILDER: CrucibleBuilderState = {
  elements: [],
  lastProcessedSceneIndex: -1,
};

/** Coerce persisted crucible data into current shape. Pre-1.0: no migrations, just defaults. */
export function migrateCrucibleState(loaded: Partial<CrucibleState>): CrucibleState {
  return {
    ...initialCrucibleState,
    direction: loaded.direction ?? null,
    goals: Array.isArray(loaded.goals) ? loaded.goals : [],
    chains: loaded.chains && typeof loaded.chains === "object" ? loaded.chains : {},
    activeGoalId: loaded.activeGoalId ?? null,
    autoChaining: false,
    builder: loaded.builder && Array.isArray(loaded.builder.elements)
      ? loaded.builder
      : { ...EMPTY_BUILDER },
    directorGuidance: (loaded as { directorGuidance?: DirectorGuidance | null }).directorGuidance ?? null,
  };
}

export const initialCrucibleState: CrucibleState = {
  direction: null,
  goals: [],
  chains: {},
  activeGoalId: null,
  autoChaining: false,
  builder: { ...EMPTY_BUILDER },
  directorGuidance: null,
};

export const crucibleSlice = createSlice({
  name: "crucible",
  initialState: initialCrucibleState,
  reducers: {
    // Signal actions — effects handle the actual work
    crucibleGoalsRequested: (state) => state,
    crucibleChainRequested: (state) => state,
    crucibleDirectorRequested: (state) => state,
    crucibleStopRequested: (state) => state,
    crucibleMergeRequested: (state) => state,

    // Direction phase reducers
    crucibleDirectionRequested: (state) => state,
    directionSet: (state, payload: { direction: string }) => {
      return { ...state, direction: payload.direction };
    },

    goalTextUpdated: (state, payload: { goalId: string; text: string }) => {
      return {
        ...state,
        goals: state.goals.map((g) =>
          g.id === payload.goalId ? { ...g, text: payload.text } : g,
        ),
      };
    },

    goalAdded: (state, payload: { goal: CrucibleGoal }) => {
      return { ...state, goals: [...state.goals, payload.goal] };
    },

    goalRemoved: (state, payload: { goalId: string }) => {
      const { [payload.goalId]: _, ...remainingChains } = state.chains;
      return {
        ...state,
        goals: state.goals.filter((g) => g.id !== payload.goalId),
        chains: remainingChains,
        activeGoalId: state.activeGoalId === payload.goalId ? null : state.activeGoalId,
      };
    },

    goalsCleared: (state) => {
      return { ...state, goals: [], chains: {}, activeGoalId: null, directorGuidance: null };
    },

    goalStarred: (state, payload: { goalId: string }) => {
      return {
        ...state,
        goals: state.goals.map((g) =>
          g.id === payload.goalId ? { ...g, starred: !g.starred } : g,
        ),
      };
    },

    goalsConfirmed: (state) => state,

    chainStarted: (state, payload: { goalId: string }) => {
      // Idempotent: if chain already exists, just set activeGoalId (enables resume)
      if (state.chains[payload.goalId]) {
        return { ...state, activeGoalId: payload.goalId };
      }

      // Seed open constraints from the goal's [OPEN] tag if present
      const goal = state.goals.find((g) => g.id === payload.goalId);
      const seedDescs = goal ? parseTagAll(goal.text, "OPEN") : [];
      const seedConstraints: Constraint[] = seedDescs.map((desc, i) => ({
        id: `seed-${payload.goalId}-${desc.slice(0, 20)}`,
        shortId: `X${i}`,
        description: desc,
        sourceSceneIndex: 0,
        status: "open" as const,
      }));

      const chain: CrucibleChain = {
        goalId: payload.goalId,
        scenes: [],
        openConstraints: seedConstraints,
        resolvedConstraints: [],
        complete: false,
        nextConstraintIndex: seedDescs.length,
        sceneBudget: 5,
      };
      return {
        ...state,
        activeGoalId: payload.goalId,
        chains: { ...state.chains, [payload.goalId]: chain },
      };
    },

    sceneBudgetUpdated: (state, payload: { goalId: string; budget: number }) => {
      const chain = state.chains[payload.goalId];
      if (!chain) return state;
      return {
        ...state,
        chains: {
          ...state.chains,
          [payload.goalId]: { ...chain, sceneBudget: payload.budget },
        },
      };
    },

    sceneAdded: (
      state,
      payload: {
        goalId: string;
        scene: CrucibleScene;
        constraints: {
          resolved: string[]; // shortIds (e.g. "X0", "X3")
          opened: Constraint[];
          grounded: string[]; // shortIds
        };
      },
    ) => {
      const chain = state.chains[payload.goalId];
      if (!chain) return state;

      // Match by shortId instead of description
      const resolvedSet = new Set(payload.constraints.resolved);
      const groundedSet = new Set(payload.constraints.grounded);
      const updatedOpen = chain.openConstraints
        .map((c) => {
          if (resolvedSet.has(c.shortId)) return { ...c, status: "resolved" as const };
          if (groundedSet.has(c.shortId)) return { ...c, status: "groundState" as const };
          return c;
        });

      const nowResolved = updatedOpen.filter((c) => c.status !== "open");
      const stillOpen = updatedOpen.filter((c) => c.status === "open");

      // Assign monotonic shortIds to new constraints
      let nextIdx = chain.nextConstraintIndex;
      const genuinelyNew = payload.constraints.opened.map((c) => ({
        ...c,
        shortId: `X${nextIdx++}`,
      }));
      const allOpen = [...stillOpen, ...genuinelyNew];

      const updatedChain: CrucibleChain = {
        ...chain,
        scenes: [...chain.scenes, payload.scene],
        openConstraints: allOpen,
        resolvedConstraints: [...chain.resolvedConstraints, ...nowResolved],
        nextConstraintIndex: nextIdx,
      };

      return {
        ...state,
        chains: { ...state.chains, [payload.goalId]: updatedChain },
      };
    },

    sceneRejected: (state, payload: { goalId: string }) => {
      const chain = state.chains[payload.goalId];
      if (!chain || chain.scenes.length === 0) return state;

      const lastScene = chain.scenes[chain.scenes.length - 1];
      const sceneIndex = chain.scenes.length - 1;

      // Remove constraints opened by this scene
      const openWithoutLast = chain.openConstraints.filter(
        (c) => c.sourceSceneIndex !== sceneIndex,
      );

      // Restore constraints that were resolved by this scene back to open (match by shortId)
      const resolvedByScene = new Set(lastScene.constraintsResolved);
      const groundedByScene = new Set(lastScene.groundStateConstraints);
      const restored = chain.resolvedConstraints.filter(
        (c) => resolvedByScene.has(c.shortId) || groundedByScene.has(c.shortId),
      ).map((c) => ({ ...c, status: "open" as const }));
      const remainingResolved = chain.resolvedConstraints.filter(
        (c) => !resolvedByScene.has(c.shortId) && !groundedByScene.has(c.shortId),
      );

      const updatedChain: CrucibleChain = {
        ...chain,
        scenes: chain.scenes.slice(0, -1),
        openConstraints: [...openWithoutLast, ...restored],
        resolvedConstraints: remainingResolved,
      };

      return {
        ...state,
        chains: { ...state.chains, [payload.goalId]: updatedChain },
      };
    },

    sceneEdited: (state, payload: { goalId: string; sceneIndex: number; scene: CrucibleScene }) => {
      const chain = state.chains[payload.goalId];
      if (!chain) return state;

      const updatedScenes = chain.scenes.map((s, i) =>
        i === payload.sceneIndex ? { ...payload.scene, tainted: true } : s,
      );

      return {
        ...state,
        chains: {
          ...state.chains,
          [payload.goalId]: { ...chain, scenes: updatedScenes },
        },
      };
    },

    sceneTainted: (state, payload: { goalId: string; sceneIndex: number }) => {
      const chain = state.chains[payload.goalId];
      if (!chain) return state;

      const updatedScenes = chain.scenes.map((s, i) =>
        i === payload.sceneIndex ? { ...s, tainted: true } : s,
      );

      return {
        ...state,
        chains: {
          ...state.chains,
          [payload.goalId]: { ...chain, scenes: updatedScenes },
        },
      };
    },

    sceneFavorited: (state, payload: { goalId: string; sceneIndex: number }) => {
      const chain = state.chains[payload.goalId];
      if (!chain) return state;

      const updatedScenes = chain.scenes.map((s, i) =>
        i === payload.sceneIndex ? { ...s, favorited: !s.favorited } : s,
      );

      return {
        ...state,
        chains: {
          ...state.chains,
          [payload.goalId]: { ...chain, scenes: updatedScenes },
        },
      };
    },

    sceneForked: (state, payload: { goalId: string; sceneIndex: number; newGoalId: string }) => {
      const chain = state.chains[payload.goalId];
      if (!chain) return state;

      const scene = chain.scenes[payload.sceneIndex];
      if (!scene) return state;

      const sceneText = scene.text;
      const newGoal: CrucibleGoal = {
        id: payload.newGoalId,
        text: sceneText,
        starred: true,
      };

      // Seed new chain with the scene's open constraints
      const newConstraints: Constraint[] = scene.newOpenConstraints.map((desc, i) => ({
        id: `${payload.newGoalId}-c${i}`,
        shortId: `X${i}`,
        description: desc,
        sourceSceneIndex: -1,
        status: "open" as const,
      }));

      const newChain: CrucibleChain = {
        goalId: payload.newGoalId,
        scenes: [],
        openConstraints: newConstraints,
        resolvedConstraints: [],
        complete: false,
        nextConstraintIndex: newConstraints.length,
        sceneBudget: chain.sceneBudget,
      };

      return {
        ...state,
        goals: [...state.goals, newGoal],
        chains: { ...state.chains, [payload.newGoalId]: newChain },
      };
    },

    scenesDeletedFrom: (state, payload: { goalId: string; fromIndex: number }) => {
      const chain = state.chains[payload.goalId];
      if (!chain) return state;

      const keptScenes = chain.scenes.slice(0, payload.fromIndex);

      // Keep only constraints whose sourceSceneIndex is within surviving scenes (or seed = 0)
      // and that are still open (not resolved by a surviving scene)
      const survivingOpen = chain.openConstraints.filter(
        (c) => c.sourceSceneIndex < payload.fromIndex,
      );
      const survivingResolved = chain.resolvedConstraints.filter(
        (c) => c.sourceSceneIndex < payload.fromIndex,
      );

      // Recompute nextConstraintIndex as max existing shortId index + 1
      const allSurviving = [...survivingOpen, ...survivingResolved];
      let maxIdx = -1;
      for (const c of allSurviving) {
        const m = c.shortId.match(/^X(\d+)$/);
        if (m) maxIdx = Math.max(maxIdx, parseInt(m[1], 10));
      }

      return {
        ...state,
        chains: {
          ...state.chains,
          [payload.goalId]: {
            ...chain,
            scenes: keptScenes,
            openConstraints: survivingOpen,
            resolvedConstraints: survivingResolved,
            complete: false,
            nextConstraintIndex: maxIdx + 1,
          },
        },
      };
    },

    constraintMarkedGroundState: (state, payload: { goalId: string; constraintId: string }) => {
      const chain = state.chains[payload.goalId];
      if (!chain) return state;

      const constraint = chain.openConstraints.find((c) => c.id === payload.constraintId);
      if (!constraint) return state;

      return {
        ...state,
        chains: {
          ...state.chains,
          [payload.goalId]: {
            ...chain,
            openConstraints: chain.openConstraints.filter((c) => c.id !== payload.constraintId),
            resolvedConstraints: [...chain.resolvedConstraints, { ...constraint, status: "groundState" as const }],
          },
        },
      };
    },

    constraintAdded: (state, payload: { goalId: string; id: string; description: string }) => {
      const chain = state.chains[payload.goalId];
      if (!chain) return state;

      const shortId = `X${chain.nextConstraintIndex}`;
      const constraint: Constraint = {
        id: payload.id,
        shortId,
        description: payload.description,
        sourceSceneIndex: chain.scenes.length, // Current scene position
        status: "open",
      };

      return {
        ...state,
        chains: {
          ...state.chains,
          [payload.goalId]: {
            ...chain,
            openConstraints: [...chain.openConstraints, constraint],
            nextConstraintIndex: chain.nextConstraintIndex + 1,
          },
        },
      };
    },

    constraintRemoved: (state, payload: { goalId: string; constraintId: string }) => {
      const chain = state.chains[payload.goalId];
      if (!chain) return state;

      return {
        ...state,
        chains: {
          ...state.chains,
          [payload.goalId]: {
            ...chain,
            openConstraints: chain.openConstraints.filter((c) => c.id !== payload.constraintId),
            resolvedConstraints: chain.resolvedConstraints.filter((c) => c.id !== payload.constraintId),
          },
        },
      };
    },

    constraintResolved: (state, payload: { goalId: string; constraintId: string }) => {
      const chain = state.chains[payload.goalId];
      if (!chain) return state;

      const constraint = chain.openConstraints.find((c) => c.id === payload.constraintId);
      if (!constraint) return state;

      return {
        ...state,
        chains: {
          ...state.chains,
          [payload.goalId]: {
            ...chain,
            openConstraints: chain.openConstraints.filter((c) => c.id !== payload.constraintId),
            resolvedConstraints: [...chain.resolvedConstraints, { ...constraint, status: "resolved" as const }],
          },
        },
      };
    },

    constraintUnresolved: (state, payload: { goalId: string; constraintId: string }) => {
      const chain = state.chains[payload.goalId];
      if (!chain) return state;

      const constraint = chain.resolvedConstraints.find((c) => c.id === payload.constraintId);
      if (!constraint) return state;

      return {
        ...state,
        chains: {
          ...state.chains,
          [payload.goalId]: {
            ...chain,
            resolvedConstraints: chain.resolvedConstraints.filter((c) => c.id !== payload.constraintId),
            openConstraints: [...chain.openConstraints, { ...constraint, status: "open" as const }],
          },
        },
      };
    },

    chainCompleted: (state, payload: { goalId: string }) => {
      const chain = state.chains[payload.goalId];
      if (!chain) return state;

      return {
        ...state,
        chains: {
          ...state.chains,
          [payload.goalId]: { ...chain, complete: true },
        },
      };
    },

    activeGoalAdvanced: (state) => {
      const starredGoals = state.goals.filter((g) => g.starred);
      const nextGoal = starredGoals.find((g) => {
        const chain = state.chains[g.id];
        return !chain || !chain.complete;
      });
      return {
        ...state,
        activeGoalId: nextGoal?.id || null,
        directorGuidance: null, // Clear — guidance is per-goal, stale across goal transitions
        builder: {
          ...state.builder,
          lastProcessedSceneIndex: -1, // Reset — scenes are per-chain, index is stale across goals
        },
      };
    },

    autoChainStarted: (state) => {
      return { ...state, autoChaining: true };
    },

    autoChainStopped: (state) => {
      return { ...state, autoChaining: false };
    },

    // Builder reducers
    crucibleBuildRequested: (state) => state,

    builderElementAdded: (state, payload: { id: string; fieldId: DulfsFieldID; name: string; content?: string }) => {
      const existing = state.builder.elements.find((el) => el.id === payload.id)
        || state.builder.elements.find((el) => el.name.toLowerCase() === payload.name.toLowerCase());
      if (existing) {
        return {
          ...state,
          builder: {
            ...state.builder,
            elements: state.builder.elements.map((el) =>
              el.id === existing.id
                ? {
                  ...el,
                  name: payload.name || el.name,
                  content: payload.content ?? el.content,
                }
                : el,
            ),
          },
        };
      }
      return {
        ...state,
        builder: {
          ...state.builder,
          elements: [
            ...state.builder.elements,
            {
              id: payload.id,
              fieldId: payload.fieldId,
              name: payload.name,
              content: payload.content || "",
            },
          ],
        },
      };
    },

    builderSceneProcessed: (state, payload: { sceneIndex: number }) => {
      return {
        ...state,
        builder: {
          ...state.builder,
          lastProcessedSceneIndex: payload.sceneIndex,
        },
      };
    },

    builderElementUpdated: (state, payload: { id: string; name?: string; content?: string }) => {
      const existing = state.builder.elements.find((el) => el.id === payload.id);
      if (!existing) return state;
      return {
        ...state,
        builder: {
          ...state.builder,
          elements: state.builder.elements.map((el) =>
            el.id === payload.id
              ? {
                ...el,
                ...(payload.name !== undefined ? { name: payload.name } : {}),
                ...(payload.content !== undefined ? { content: payload.content } : {}),
              }
              : el,
          ),
        },
      };
    },

    builderElementRemoved: (state, payload: { id: string }) => {
      return {
        ...state,
        builder: {
          ...state.builder,
          elements: state.builder.elements.filter((el) => el.id !== payload.id),
        },
      };
    },

    directorGuidanceConsumed: (state, payload: { by: "solver" | "builder" }) => {
      if (!state.directorGuidance) return state;
      const updated = { ...state.directorGuidance };
      if (payload.by === "solver") updated.solver = "";
      if (payload.by === "builder") updated.builder = "";
      if (!updated.solver && !updated.builder) return { ...state, directorGuidance: null };
      return { ...state, directorGuidance: updated };
    },

    directorGuidanceSet: (state, payload: { solver: string; builder: string; atSceneIndex: number }) => {
      return {
        ...state,
        directorGuidance: {
          solver: payload.solver,
          builder: payload.builder,
          atSceneIndex: payload.atSceneIndex,
        },
      };
    },

    crucibleReset: () => {
      return { ...initialCrucibleState };
    },
  },
});

export const {
  crucibleGoalsRequested,
  crucibleChainRequested,
  crucibleDirectorRequested,
  crucibleStopRequested,
  crucibleMergeRequested,
  crucibleDirectionRequested,
  directionSet,
  goalTextUpdated,
  goalAdded,
  goalRemoved,
  goalsCleared,
  goalStarred,
  goalsConfirmed,
  chainStarted,
  sceneBudgetUpdated,
  sceneAdded,
  sceneRejected,
  sceneEdited,
  sceneTainted,
  sceneFavorited,
  sceneForked,
  scenesDeletedFrom,
  constraintMarkedGroundState,
  constraintAdded,
  constraintRemoved,
  constraintResolved,
  constraintUnresolved,
  chainCompleted,
  activeGoalAdvanced,
  autoChainStarted,
  autoChainStopped,
  crucibleBuildRequested,
  builderElementAdded,
  builderElementUpdated,
  builderSceneProcessed,
  builderElementRemoved,
  directorGuidanceConsumed,
  directorGuidanceSet,
  crucibleReset,
} = crucibleSlice.actions;
