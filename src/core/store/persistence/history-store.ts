// Async adapter over api.v1.historyStorage.
//
// Two rules live here, both measured rather than assumed (design §12.1, §6.3):
//
//   1. Every write passes its node EXPLICITLY. Reading currentNodeId() and then
//      calling set() without a node has been observed landing the value two
//      nodes away from the id just read; a debounced flush is far worse. Callers
//      capture the node when the action is dispatched and hand it back here.
//   2. Loading fans out from the index rather than calling list(). list() does
//      inherit ancestor keys, but the index is authoritative for existence
//      anyway, so enumerating through it is both correct and independent of
//      list()'s semantics.
//
// Nothing here removes a record key — see keyspace.ts for why deletion is an
// index write.

import type { StoryState, WorldState } from "../types";
import {
  INDEX_KEY,
  entityKey,
  groupKey,
  fieldKey,
  applyRecords,
  type PersistIndex,
  type PersistRecords,
} from "./keyspace";

/** The node to stamp a write with. Call this when the action is dispatched. */
export function captureNode(): Promise<number> {
  return api.v1.document.history.currentNodeId();
}

export async function saveRecords(
  records: PersistRecords,
  nodeId: number,
): Promise<void> {
  await Promise.all(
    Object.entries(records).map(([key, value]) =>
      api.v1.historyStorage.set(key, value, nodeId),
    ),
  );
}

export async function loadBranchState(nodeId?: number): Promise<{
  story: StoryState;
  world: WorldState;
}> {
  const node = nodeId ?? (await captureNode());
  const index = (await api.v1.historyStorage.get(INDEX_KEY, node)) as
    PersistIndex | undefined;

  if (!index) return applyRecords(undefined, {});

  const keys = [
    ...index.entityIds.map(entityKey),
    ...index.groupIds.map(groupKey),
    ...index.fieldIds.map(fieldKey),
  ];

  const values = await Promise.all(
    keys.map((key) => api.v1.historyStorage.get(key, node)),
  );

  const records: PersistRecords = {};
  keys.forEach((key, i) => {
    if (values[i] !== undefined) records[key] = values[i];
  });

  return applyRecords(index, records);
}
