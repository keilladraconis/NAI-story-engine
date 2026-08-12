// Effect-free streaming channel for in-flight generation text, keyed by a
// target id (chat message id). This deliberately bypasses the nai-store: per
// token we only mutate a Map and notify direct subscribers — no reducer, no
// effects pipeline, no `updateParts` fan-out. Dispatching every token through
// the store wedges the JSX panel's Preact render flush (it never repaints until
// a user event); writing to this plain channel repaints cleanly, exactly like a
// bare external store. The committed message text is still written to the store
// once, on generation completion. See Message.tsx / useStream for the read side.

const buffers = new Map<string, string>();
const subs = new Map<string, Set<() => void>>();

function notify(key: string): void {
  subs.get(key)?.forEach((fn) => fn());
}

/** Overwrite the in-flight text for a key and notify subscribers. */
export function writeStream(key: string, text: string): void {
  buffers.set(key, text);
  notify(key);
}

/** Append a chunk to the in-flight text for a key and notify subscribers. */
export function appendStream(key: string, chunk: string): void {
  writeStream(key, (buffers.get(key) ?? "") + chunk);
}

/** Current in-flight text, or undefined when nothing is streaming for this key. */
export function readStream(key: string): string | undefined {
  return buffers.get(key);
}

/** Drop the in-flight text for a key (call once the committed value lands). */
export function clearStream(key: string): void {
  if (buffers.delete(key)) notify(key);
}

/** Subscribe to in-flight changes for a key. Returns an unsubscribe function. */
export function subscribeStream(key: string, cb: () => void): () => void {
  let set = subs.get(key);
  if (!set) {
    set = new Set();
    subs.set(key, set);
  }
  set.add(cb);
  return () => {
    set!.delete(cb);
    if (set!.size === 0) subs.delete(key);
  };
}
