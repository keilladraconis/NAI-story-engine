import { vi } from "vitest";

export type HistoryFake = {
  push(): number;
  goto(node: number): void;
  current(): number;
  reset(): void;
};

/** In-memory historyStorage + document.history with real ancestor inheritance.
 *
 *  The behaviours that matter, all measured against the live backend (design
 *  §12.1): writes land at exactly one node; get/list search ancestors until a
 *  value is found; a node off the current path is not addressable; node ids are
 *  opaque and unordered — this fake deliberately hands out DESCENDING ids so a
 *  test that sorts them or assumes ordering fails loudly. */
export function installHistoryFake(): HistoryFake {
  // node id -> parent id (undefined for the root)
  const parents = new Map<number, number | undefined>();
  // node id -> its own writes only; inheritance is resolved on read
  const data = new Map<number, Map<string, unknown>>();
  let nextId = 1_000_000;
  let cursor = nextId;

  const init = () => {
    parents.clear();
    data.clear();
    nextId = 1_000_000;
    cursor = nextId;
    parents.set(cursor, undefined);
    data.set(cursor, new Map());
  };
  init();

  const at = (node: number): Map<string, unknown> => {
    if (!data.has(node)) data.set(node, new Map());
    return data.get(node) as Map<string, unknown>;
  };

  /** current node first, then each ancestor. */
  const chain = (node: number): number[] => {
    const out: number[] = [];
    let id: number | undefined = node;
    while (id !== undefined) {
      out.push(id);
      id = parents.get(id);
    }
    return out;
  };

  const lookup = (key: string, node: number): unknown => {
    for (const id of chain(node)) {
      const bucket = data.get(id);
      if (bucket && bucket.has(key)) return bucket.get(key);
    }
    return undefined;
  };

  const reachable = (node: number): boolean => chain(cursor).includes(node);

  api.v1.historyStorage = {
    get: vi.fn(async (key: string, node?: number) => {
      const target = node ?? cursor;
      if (!reachable(target)) return undefined;
      return lookup(key, target);
    }),
    set: vi.fn(async (key: string, value: unknown, node?: number) => {
      at(node ?? cursor).set(key, value);
    }),
    remove: vi.fn(async (key: string, node?: number) => {
      at(node ?? cursor).delete(key);
    }),
    has: vi.fn(async (key: string, node?: number) => {
      const target = node ?? cursor;
      return reachable(target) && lookup(key, target) !== undefined;
    }),
    list: vi.fn(async (node?: number) => {
      const target = node ?? cursor;
      if (!reachable(target)) return [];
      const keys = new Set<string>();
      for (const id of chain(target)) {
        for (const k of data.get(id)?.keys() ?? []) keys.add(k);
      }
      return [...keys];
    }),
    getOrDefault: vi.fn(
      async (key: string, fallback: unknown, node?: number) => {
        // Same reachability gate as get/has/list. Without it a read against a
        // node off the current ancestor chain would walk that node's own chain
        // and hand back real data where the backend returns nothing.
        const target = node ?? cursor;
        if (!reachable(target)) return fallback;
        const v = lookup(key, target);
        return v === undefined ? fallback : v;
      },
    ),
    setIfAbsent: vi.fn(async () => false),
  } as unknown as typeof api.v1.historyStorage;

  api.v1.document.history = {
    currentNodeId: vi.fn(async () => cursor),
    nodeState: vi.fn(async (node: number) => ({
      backwardPath: [],
      forwardPath: [],
      sections: [],
      targetNode: {
        id: node,
        parent: parents.get(node),
        children: [],
        route: undefined,
        genPosition: undefined,
      },
    })),
    mostRecentGenerationNodeId: vi.fn(async () => undefined),
    previousNodeId: vi.fn(async () => parents.get(cursor)),
    undo: vi.fn(async () => true),
    redo: vi.fn(async () => true),
    jump: vi.fn(async () => true),
  } as unknown as typeof api.v1.document.history;

  return {
    push() {
      // Descending ids on purpose: real node ids are not monotonic.
      const id = --nextId;
      parents.set(id, cursor);
      data.set(id, new Map());
      cursor = id;
      return id;
    },
    goto(node: number) {
      cursor = node;
    },
    current() {
      return cursor;
    },
    reset: init,
  };
}
