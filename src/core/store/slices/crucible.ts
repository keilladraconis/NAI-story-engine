import { createSlice } from "nai-store";
import {
  CrucibleState,
  CrucibleNode,
  CrucibleEdge,
  CrucibleNodeKind,
} from "../types";
import { WORLD_KINDS } from "../../utils/crucible-strategy";

/** Soft cap for world nodes — 5th connection evicts the oldest */
export const WORLD_NODE_SOFT_CAP = 4;

/**
 * Enforce soft cap on world nodes: if a world node has more than WORLD_NODE_SOFT_CAP
 * edges, evict the oldest (earliest by array position) to make room.
 */
function enforceWorldSoftCap(
  nodes: CrucibleNode[],
  edges: CrucibleEdge[],
): CrucibleEdge[] {
  const worldIds = new Set(
    nodes.filter((n) => WORLD_KINDS.has(n.kind)).map((n) => n.id),
  );
  let result = edges;
  for (const id of worldIds) {
    const nodeEdges = result
      .map((e, i) => ({ edge: e, index: i }))
      .filter(({ edge }) => edge.source === id || edge.target === id);
    if (nodeEdges.length > WORLD_NODE_SOFT_CAP) {
      const toRemove = nodeEdges.length - WORLD_NODE_SOFT_CAP;
      const removeIndices = new Set(nodeEdges.slice(0, toRemove).map(({ index }) => index));
      result = result.filter((_, i) => !removeIndices.has(i));
    }
  }
  return result;
}

export const initialCrucibleState: CrucibleState = {
  phase: "idle",
  intent: null,
  strategyLabel: null,
  nodes: [],
  edges: [],
  autoSolving: false,
  solverFeedback: null,
  solverStalls: 0,
  windowOpen: false,
};

export const crucibleSlice = createSlice({
  name: "crucible",
  initialState: initialCrucibleState,
  reducers: {
    crucibleStarted: (state) => {
      return state; // Intent action — effects handle generation, phase changes on nodesAdded
    },
    intentSet: (state, payload: { intent: string; strategyLabel?: string }) => {
      return {
        ...state,
        intent: payload.intent,
        strategyLabel: payload.strategyLabel || state.strategyLabel,
      };
    },
    intentEdited: (state, payload: { intent: string }) => {
      return { ...state, intent: payload.intent };
    },
    strategyEdited: (state, payload: { strategy: string }) => {
      return { ...state, strategyLabel: payload.strategy };
    },
    crucibleIntentRequested: (state) => {
      return state; // Intent action — effects queue intent generation
    },
    nodesAdded: (state, payload: { nodes: CrucibleNode[]; edges?: CrucibleEdge[] }) => {
      const allNodes = [...state.nodes, ...payload.nodes];
      const mergedEdges = payload.edges ? [...state.edges, ...payload.edges] : state.edges;
      return {
        ...state,
        phase: "active" as const,
        nodes: allNodes,
        edges: enforceWorldSoftCap(allNodes, mergedEdges),
      };
    },
    nodeUpdated: (state, payload: { id: string; content: string }) => {
      return {
        ...state,
        nodes: state.nodes.map((node) =>
          node.id === payload.id
            ? { ...node, content: payload.content }
            : node,
        ),
      };
    },
    edgeAdded: (state, payload: { edge: CrucibleEdge }) => {
      return {
        ...state,
        edges: enforceWorldSoftCap(state.nodes, [...state.edges, payload.edge]),
      };
    },
    nodeFavorited: (state, payload: { id: string }) => {
      return {
        ...state,
        nodes: state.nodes.map((node) =>
          node.id === payload.id
            ? { ...node, status: node.status === "favorited" ? "pending" as const : "favorited" as const }
            : node,
        ),
      };
    },
    nodeEdited: (state, payload: { id: string; content: string }) => {
      return {
        ...state,
        nodes: state.nodes.map((node) =>
          node.id === payload.id
            ? { ...node, content: payload.content, status: "edited" as const }
            : node,
        ),
      };
    },
    nodeDisfavored: (state, payload: { id: string }) => {
      return {
        ...state,
        nodes: state.nodes.map((node) =>
          node.id === payload.id
            ? { ...node, status: node.status === "disfavored" ? "pending" as const : "disfavored" as const }
            : node,
        ),
      };
    },
    nodesPruned: (state) => {
      // 1. Remove disfavored nodes
      const afterDisfavor = state.nodes.filter((n) => n.status !== "disfavored");

      // 2. Find anchor nodes (favorited, edited, or goal)
      const anchorIds = new Set(
        afterDisfavor
          .filter((n) => n.status === "favorited" || n.status === "edited" || n.kind === "goal")
          .map((n) => n.id),
      );

      // 3. BFS from anchors via edges to find reachable nodes
      const nodeIds = new Set(afterDisfavor.map((n) => n.id));
      const reachable = new Set(anchorIds);
      const queue = [...anchorIds];
      while (queue.length > 0) {
        const current = queue.pop()!;
        for (const edge of state.edges) {
          const neighbor =
            edge.source === current ? edge.target :
            edge.target === current ? edge.source : null;
          if (neighbor && nodeIds.has(neighbor) && !reachable.has(neighbor)) {
            reachable.add(neighbor);
            queue.push(neighbor);
          }
        }
      }

      return {
        ...state,
        nodes: afterDisfavor.filter((n) => reachable.has(n.id)),
        edges: state.edges.filter(
          (e) => reachable.has(e.source) && reachable.has(e.target),
        ),
      };
    },
    userGoalAdded: (state) => {
      const node: CrucibleNode = {
        id: api.v1.uuid(),
        kind: "goal",
        origin: "user",
        status: "pending",
        content: "",
        stale: false,
      };
      return {
        ...state,
        phase: state.phase === "idle" ? "active" as const : state.phase,
        nodes: [...state.nodes, node],
      };
    },
    userNodeAdded: (state, payload: { kind: CrucibleNodeKind }) => {
      const node: CrucibleNode = {
        id: api.v1.uuid(),
        kind: payload.kind,
        origin: "user",
        status: "pending",
        content: "",
        stale: false,
      };
      return {
        ...state,
        phase: state.phase === "idle" ? "active" as const : state.phase,
        nodes: [...state.nodes, node],
      };
    },
    crucibleGoalsRequested: (state) => {
      return state; // Intent action — effects queue goals generation
    },
    crucibleStopRequested: (state) => {
      return state; // Intent action — effects cancel active request + stop auto-solve
    },
    solverFeedbackSet: (state, payload: { feedback: string | null }) => {
      return {
        ...state,
        solverFeedback: payload.feedback,
        solverStalls: payload.feedback ? state.solverStalls + 1 : 0,
      };
    },
    uiCrucibleSolveNextRequested: (state) => {
      return { ...state, autoSolving: true };
    },
    crucibleAutoSolveStopped: (state) => {
      return { ...state, autoSolving: false };
    },
    crucibleCommitted: (state) => {
      return { ...state, phase: "committed" as const, autoSolving: false };
    },
    crucibleReset: () => {
      return { ...initialCrucibleState };
    },
    crucibleLoaded: (_state, payload: { crucible: CrucibleState }) => {
      return { ...payload.crucible, autoSolving: false };
    },
    windowToggled: (state) => {
      return { ...state, windowOpen: !state.windowOpen };
    },
  },
});

export const {
  crucibleStarted,
  intentSet,
  intentEdited,
  strategyEdited,
  crucibleIntentRequested,
  nodesAdded,
  nodeUpdated,
  edgeAdded,
  nodeFavorited,
  nodesPruned,
  nodeEdited,
  nodeDisfavored,
  userGoalAdded,
  userNodeAdded,
  crucibleGoalsRequested,
  crucibleStopRequested,
  solverFeedbackSet,
  uiCrucibleSolveNextRequested,
  crucibleAutoSolveStopped,
  crucibleCommitted,
  crucibleReset,
  crucibleLoaded,
  windowToggled,
} = crucibleSlice.actions;
