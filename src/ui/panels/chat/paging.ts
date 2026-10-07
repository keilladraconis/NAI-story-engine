// The slice of a chat the list renders. Pure, so it is testable headless.
//
// This is VIEW state: where the writer is looking. It never enters the store
// and nothing that builds a prompt reads it — a model is always sent the whole
// transcript, whatever page is on screen.

export const PAGE_SIZE = 25;

export type PageWindow = {
  /** Index of the first message shown, inclusive. */
  start: number;
  /** Index after the last message shown. */
  end: number;
  /** `back` after clamping: how many pages before the newest this is. */
  back: number;
  hasOlder: boolean;
  hasNewer: boolean;
};

/** The window `back` pages before the newest, over a chat of `total` messages.
 *  Pages are counted from the end, so the newest page is always full and the
 *  oldest holds the remainder. `back` is clamped: a chat can shrink under a
 *  writer who has paged back (a retry prunes it), and the window must never
 *  come up empty over a chat that has messages. */
export function pageWindow(total: number, back: number): PageWindow {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const clamped = Math.min(Math.max(0, back), pages - 1);
  const end = total - clamped * PAGE_SIZE;
  const start = Math.max(0, end - PAGE_SIZE);
  return {
    start,
    end,
    back: clamped,
    hasOlder: start > 0,
    hasNewer: clamped > 0,
  };
}
