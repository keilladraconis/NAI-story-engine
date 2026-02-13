import { createSlice } from "nai-store";
import {
  CrucibleState,
  CrucibleNode,
  CrucibleNodeStatus,
  CrucibleStrategy,
} from "../types";

export const initialCrucibleState: CrucibleState = {
  phase: "idle",
  strategy: null,
  nodes: [],
  currentRound: 0,
  windowOpen: false,
};

/**
 * Mark nodes whose `serves` array includes the given ID as stale.
 */
function markDependentsStale(nodes: CrucibleNode[], id: string): CrucibleNode[] {
  return nodes.map((node) =>
    node.serves.includes(id) ? { ...node, stale: true } : node,
  );
}

export const crucibleSlice = createSlice({
  name: "crucible",
  initialState: initialCrucibleState,
  reducers: {
    crucibleStarted: (state) => {
      return { ...state, phase: "seeding" as const };
    },
    crucibleSeeded: (state, payload: { node: CrucibleNode }) => {
      return {
        ...state,
        phase: "expanding" as const,
        nodes: [...state.nodes, payload.node],
      };
    },
    nodesAdded: (state, payload: { nodes: CrucibleNode[] }) => {
      return {
        ...state,
        nodes: [...state.nodes, ...payload.nodes],
      };
    },
    nodeStatusChanged: (
      state,
      payload: { id: string; status: CrucibleNodeStatus },
    ) => {
      let nodes = state.nodes.map((node) =>
        node.id === payload.id ? { ...node, status: payload.status } : node,
      );
      if (payload.status === "edited" || payload.status === "rejected") {
        nodes = markDependentsStale(nodes, payload.id);
      }
      return { ...state, nodes };
    },
    nodeEdited: (
      state,
      payload: { id: string; content: string; summary: string },
    ) => {
      let nodes = state.nodes.map((node) =>
        node.id === payload.id
          ? {
              ...node,
              content: payload.content,
              summary: payload.summary,
              status: "edited" as const,
            }
          : node,
      );
      nodes = markDependentsStale(nodes, payload.id);
      return { ...state, nodes };
    },
    nodeRemoved: (state, payload: { id: string }) => {
      const staleMarked = markDependentsStale(state.nodes, payload.id);
      return {
        ...state,
        nodes: staleMarked.filter((node) => node.id !== payload.id),
      };
    },
    strategySelected: (state, payload: { strategy: CrucibleStrategy }) => {
      return { ...state, strategy: payload.strategy };
    },
    roundAdvanced: (state) => {
      return { ...state, currentRound: state.currentRound + 1 };
    },
    crucibleCommitted: (state) => {
      return { ...state, phase: "committed" as const };
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
  crucibleSeeded,
  nodesAdded,
  nodeStatusChanged,
  nodeEdited,
  nodeRemoved,
  strategySelected,
  roundAdvanced,
  crucibleCommitted,
  crucibleReset,
  crucibleLoaded,
  windowToggled,
} = crucibleSlice.actions;
