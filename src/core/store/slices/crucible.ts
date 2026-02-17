import { createSlice } from "nai-store";
import {
  CrucibleState,
  CrucibleGoal,
  CrucibleBeat,
  CrucibleChain,
  CrucibleBuilderState,
  Constraint,
} from "../types";
import { DulfsFieldID } from "../../../config/field-definitions";
import { parseTagAll } from "../../utils/tag-parser";

const EMPTY_BUILDER: CrucibleBuilderState = {
  nodes: [],
  lastProcessedBeatIndex: -1,
};

/** Migrate raw persisted crucible data — backfills shortIds, strips dead fields. */
export function migrateCrucibleState(loaded: CrucibleState): CrucibleState {
  const chains: Record<string, CrucibleChain> = {};
  for (const [goalId, chain] of Object.entries(loaded.chains)) {
    let nextIdx = (chain as { nextConstraintIndex?: number }).nextConstraintIndex ?? 0;
    const backfillShortId = (c: Constraint): Constraint => {
      if (c.shortId) return c;
      return { ...c, shortId: `X${nextIdx++}` };
    };

    const openConstraints = chain.openConstraints.map(backfillShortId);
    const resolvedConstraints = chain.resolvedConstraints.map(backfillShortId);

    chains[goalId] = {
      goalId: chain.goalId,
      beats: chain.beats.map((b) => ({
        text: b.text,
        constraintsResolved: b.constraintsResolved,
        newOpenConstraints: b.newOpenConstraints,
        groundStateConstraints: b.groundStateConstraints,
        ...(b.tainted ? { tainted: true } : {}),
        ...(b.favorited ? { favorited: true } : {}),
      })),
      openConstraints,
      resolvedConstraints,
      complete: chain.complete,
      nextConstraintIndex: nextIdx,
    };
  }

  return {
    builderActive: false,
    intent: loaded.intent,
    goals: loaded.goals,
    chains,
    activeGoalId: loaded.activeGoalId,
    checkpointReason: loaded.checkpointReason,
    autoChaining: false,
    solverStalls: 0,
    builder: loaded.builder
      ? {
        ...loaded.builder,
        nodes: loaded.builder.nodes.map((n) => ({
          ...n,
          content: n.content || "",
        })),
      }
      : { ...EMPTY_BUILDER },
  };
}

export const initialCrucibleState: CrucibleState = {
  builderActive: false,
  intent: null,
  goals: [],
  chains: {},
  activeGoalId: null,
  checkpointReason: null,
  autoChaining: false,
  solverStalls: 0,
  builder: { ...EMPTY_BUILDER },
};

export const crucibleSlice = createSlice({
  name: "crucible",
  initialState: initialCrucibleState,
  reducers: {
    // Intent actions — effects handle the actual work
    crucibleGoalsRequested: (state) => state,
    crucibleChainRequested: (state) => state,
    crucibleStopRequested: (state) => state,

    // Intent phase reducers
    crucibleIntentRequested: (state) => state,
    intentSet: (state, payload: { intent: string }) => {
      return { ...state, intent: payload.intent };
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
      return { ...state, goals: [], chains: {}, activeGoalId: null };
    },

    goalToggled: (state, payload: { goalId: string }) => {
      return {
        ...state,
        goals: state.goals.map((g) =>
          g.id === payload.goalId ? { ...g, selected: !g.selected } : g,
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
        sourceBeatIndex: 0,
        status: "open" as const,
      }));

      const chain: CrucibleChain = {
        goalId: payload.goalId,
        beats: [],
        openConstraints: seedConstraints,
        resolvedConstraints: [],
        complete: false,
        nextConstraintIndex: seedDescs.length,
      };
      return {
        ...state,
        activeGoalId: payload.goalId,
        chains: { ...state.chains, [payload.goalId]: chain },
      };
    },

    beatAdded: (
      state,
      payload: {
        goalId: string;
        beat: CrucibleBeat;
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
        beats: [...chain.beats, payload.beat],
        openConstraints: allOpen,
        resolvedConstraints: [...chain.resolvedConstraints, ...nowResolved],
        nextConstraintIndex: nextIdx,
      };

      return {
        ...state,
        chains: { ...state.chains, [payload.goalId]: updatedChain },
      };
    },

    beatRejected: (state, payload: { goalId: string }) => {
      const chain = state.chains[payload.goalId];
      if (!chain || chain.beats.length === 0) return state;

      const lastBeat = chain.beats[chain.beats.length - 1];
      const beatIndex = chain.beats.length - 1;

      // Remove constraints opened by this beat
      const openWithoutLast = chain.openConstraints.filter(
        (c) => c.sourceBeatIndex !== beatIndex,
      );

      // Restore constraints that were resolved by this beat back to open (match by shortId)
      const resolvedByBeat = new Set(lastBeat.constraintsResolved);
      const groundedByBeat = new Set(lastBeat.groundStateConstraints);
      const restored = chain.resolvedConstraints.filter(
        (c) => resolvedByBeat.has(c.shortId) || groundedByBeat.has(c.shortId),
      ).map((c) => ({ ...c, status: "open" as const }));
      const remainingResolved = chain.resolvedConstraints.filter(
        (c) => !resolvedByBeat.has(c.shortId) && !groundedByBeat.has(c.shortId),
      );

      const updatedChain: CrucibleChain = {
        ...chain,
        beats: chain.beats.slice(0, -1),
        openConstraints: [...openWithoutLast, ...restored],
        resolvedConstraints: remainingResolved,
      };

      return {
        ...state,
        chains: { ...state.chains, [payload.goalId]: updatedChain },
        checkpointReason: null,
      };
    },

    beatEdited: (state, payload: { goalId: string; beatIndex: number; beat: CrucibleBeat }) => {
      const chain = state.chains[payload.goalId];
      if (!chain) return state;

      const updatedBeats = chain.beats.map((b, i) =>
        i === payload.beatIndex ? { ...payload.beat, tainted: true } : b,
      );

      return {
        ...state,
        chains: {
          ...state.chains,
          [payload.goalId]: { ...chain, beats: updatedBeats },
        },
      };
    },

    beatTainted: (state, payload: { goalId: string; beatIndex: number }) => {
      const chain = state.chains[payload.goalId];
      if (!chain) return state;

      const updatedBeats = chain.beats.map((b, i) =>
        i === payload.beatIndex ? { ...b, tainted: true } : b,
      );

      return {
        ...state,
        chains: {
          ...state.chains,
          [payload.goalId]: { ...chain, beats: updatedBeats },
        },
      };
    },

    beatFavorited: (state, payload: { goalId: string; beatIndex: number }) => {
      const chain = state.chains[payload.goalId];
      if (!chain) return state;

      const updatedBeats = chain.beats.map((b, i) =>
        i === payload.beatIndex ? { ...b, favorited: !b.favorited } : b,
      );

      return {
        ...state,
        chains: {
          ...state.chains,
          [payload.goalId]: { ...chain, beats: updatedBeats },
        },
      };
    },

    beatForked: (state, payload: { goalId: string; beatIndex: number; newGoalId: string }) => {
      const chain = state.chains[payload.goalId];
      if (!chain) return state;

      const beat = chain.beats[payload.beatIndex];
      if (!beat) return state;

      const sceneText = beat.text;
      const newGoal: CrucibleGoal = {
        id: payload.newGoalId,
        text: sceneText,
        selected: true,
      };

      // Seed new chain with the beat's open constraints
      const newConstraints: Constraint[] = beat.newOpenConstraints.map((desc, i) => ({
        id: `${payload.newGoalId}-c${i}`,
        shortId: `X${i}`,
        description: desc,
        sourceBeatIndex: -1,
        status: "open" as const,
      }));

      const newChain: CrucibleChain = {
        goalId: payload.newGoalId,
        beats: [],
        openConstraints: newConstraints,
        resolvedConstraints: [],
        complete: false,
        nextConstraintIndex: newConstraints.length,
      };

      return {
        ...state,
        goals: [...state.goals, newGoal],
        chains: { ...state.chains, [payload.newGoalId]: newChain },
      };
    },

    beatsDeletedFrom: (state, payload: { goalId: string; fromIndex: number }) => {
      const chain = state.chains[payload.goalId];
      if (!chain) return state;

      const keptBeats = chain.beats.slice(0, payload.fromIndex);

      // Keep only constraints whose sourceBeatIndex is within surviving beats (or seed = 0)
      // and that are still open (not resolved by a surviving beat)
      const survivingOpen = chain.openConstraints.filter(
        (c) => c.sourceBeatIndex < payload.fromIndex,
      );
      const survivingResolved = chain.resolvedConstraints.filter(
        (c) => c.sourceBeatIndex < payload.fromIndex,
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
            beats: keptBeats,
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
      const selectedGoals = state.goals.filter((g) => g.selected);
      const nextGoal = selectedGoals.find((g) => {
        const chain = state.chains[g.id];
        return !chain || !chain.complete;
      });
      return {
        ...state,
        activeGoalId: nextGoal?.id || null,
      };
    },

    checkpointSet: (state, payload: { reason: string }) => {
      return { ...state, checkpointReason: payload.reason };
    },

    checkpointCleared: (state) => {
      return { ...state, checkpointReason: null };
    },

    autoChainStarted: (state) => {
      return { ...state, autoChaining: true, solverStalls: 0 };
    },

    autoChainStopped: (state) => {
      return { ...state, autoChaining: false };
    },

    builderActivated: (state) => {
      return { ...state, builderActive: true };
    },

    // Builder reducers
    crucibleBuildRequested: (state) => state,

    builderNodeAdded: (state, payload: { id: string; fieldId: DulfsFieldID; name: string; content?: string }) => {
      const existing = state.builder.nodes.find((n) => n.id === payload.id)
        || state.builder.nodes.find((n) => n.name.toLowerCase() === payload.name.toLowerCase());
      if (existing) {
        return {
          ...state,
          builder: {
            ...state.builder,
            nodes: state.builder.nodes.map((n) =>
              n.id === existing.id
                ? {
                  ...n,
                  name: payload.name || n.name,
                  content: payload.content ?? n.content,
                }
                : n,
            ),
          },
        };
      }
      return {
        ...state,
        builder: {
          ...state.builder,
          nodes: [
            ...state.builder.nodes,
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

    builderBeatProcessed: (state, payload: { beatIndex: number }) => {
      return {
        ...state,
        builder: {
          ...state.builder,
          lastProcessedBeatIndex: payload.beatIndex,
        },
      };
    },

    builderNodeUpdated: (state, payload: { id: string; name?: string; content?: string }) => {
      const existing = state.builder.nodes.find((n) => n.id === payload.id);
      if (!existing) return state;
      return {
        ...state,
        builder: {
          ...state.builder,
          nodes: state.builder.nodes.map((n) =>
            n.id === payload.id
              ? {
                ...n,
                ...(payload.name !== undefined ? { name: payload.name } : {}),
                ...(payload.content !== undefined ? { content: payload.content } : {}),
              }
              : n,
          ),
        },
      };
    },

    builderNodeRemoved: (state, payload: { id: string }) => {
      return {
        ...state,
        builder: {
          ...state.builder,
          nodes: state.builder.nodes.filter((n) => n.id !== payload.id),
        },
      };
    },

    builderDeactivated: (state) => {
      return { ...state, builderActive: false };
    },

    crucibleReset: () => {
      return { ...initialCrucibleState };
    },
  },
});

export const {
  crucibleGoalsRequested,
  crucibleChainRequested,
  crucibleStopRequested,
  crucibleIntentRequested,
  intentSet,
  goalTextUpdated,
  goalAdded,
  goalRemoved,
  goalsCleared,
  goalToggled,
  goalsConfirmed,
  chainStarted,
  beatAdded,
  beatRejected,
  beatEdited,
  beatTainted,
  beatFavorited,
  beatForked,
  beatsDeletedFrom,
  constraintMarkedGroundState,
  chainCompleted,
  activeGoalAdvanced,
  checkpointSet,
  checkpointCleared,
  autoChainStarted,
  autoChainStopped,
  builderActivated,
  crucibleBuildRequested,
  builderNodeAdded,
  builderNodeUpdated,
  builderBeatProcessed,
  builderNodeRemoved,
  builderDeactivated,
  crucibleReset,
} = crucibleSlice.actions;
