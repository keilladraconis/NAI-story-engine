import { createSlice } from "nai-store";
import {
  CrucibleState,
  CrucibleNode,
  CrucibleEdge,
  CrucibleNodeKind,
} from "../types";

export const initialCrucibleState: CrucibleState = {
  phase: "idle",
  intent: null,
  strategyLabel: null,
  nodes: [],
  edges: [],
  autoSolving: false,
  solverFeedback: null,
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
    nodesAdded: (state, payload: { nodes: CrucibleNode[]; edges?: CrucibleEdge[] }) => {
      return {
        ...state,
        phase: "active" as const,
        nodes: [...state.nodes, ...payload.nodes],
        edges: payload.edges ? [...state.edges, ...payload.edges] : state.edges,
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
        edges: [...state.edges, payload.edge],
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
      return { ...state, solverFeedback: payload.feedback };
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
      return payload.crucible;
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
