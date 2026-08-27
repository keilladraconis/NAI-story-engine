// The opening-scene card's only way of noticing the document changed.
//
// It used to be `runtime.historyEpoch`, bumped by the one `onHistoryNavigated`
// registration; that hook went with §7's reconciliation, because Story Engine
// no longer tracks history. The card's need survived the hook's — a writer who
// generates an opening scene, undoes it, and wants another one has to be able
// to see the card again — so it polls the document instead. These tests are
// what stops the poll being deleted as "leftover history plumbing".
import { describe, it, expect, vi, beforeEach } from "vitest";
import { watchDocumentContent } from "../../src/ui/panels/setup/use-document-content";

const timers = api.v1.timers as unknown as {
  setTimeout: ReturnType<typeof vi.fn>;
  clearTimeout: ReturnType<typeof vi.fn>;
};
const doc = api.v1.document as unknown as {
  sectionIds: ReturnType<typeof vi.fn>;
};

/** Runs whatever the poll has armed, then lets its read resolve. */
async function tick(): Promise<void> {
  const armed = timers.setTimeout.mock.calls.at(-1);
  expect(armed).toBeDefined();
  (armed![0] as () => void)();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  vi.clearAllMocks();
  // The real setTimeout mock schedules on the host clock, which would fire the
  // chain underneath these tests. Here the callback is held and run by `tick`.
  timers.setTimeout.mockImplementation(() => Promise.resolve(1));
  doc.sectionIds.mockResolvedValue([]);
});

describe("watchDocumentContent", () => {
  it("reports the document before any timer has fired", async () => {
    doc.sectionIds.mockResolvedValue([1, 2]);
    const seen: boolean[] = [];
    const stop = watchDocumentContent((has) => seen.push(has));
    await Promise.resolve();
    await Promise.resolve();
    expect(seen).toEqual([true]);
    stop();
  });

  it("keeps reading, so an undo back to a blank document is noticed", async () => {
    // The case the hook used to cover and nothing else does: the writer
    // generates an opening scene and undoes it. No action is dispatched, no
    // component remounts — only a re-read of the document can see it.
    doc.sectionIds.mockResolvedValue([1]);
    const seen: boolean[] = [];
    const stop = watchDocumentContent((has) => seen.push(has));
    await Promise.resolve();
    await Promise.resolve();

    doc.sectionIds.mockResolvedValue([]);
    await tick();

    expect(seen).toEqual([true, false]);
    stop();
  });

  it("arms the next read only once the previous one has landed", async () => {
    // Serial, not an interval: a slow read must not stack a second behind it.
    let release: (ids: number[]) => void = () => {};
    doc.sectionIds.mockReturnValue(
      new Promise<number[]>((r) => {
        release = r;
      }),
    );
    const stop = watchDocumentContent(() => {});
    await Promise.resolve();
    expect(timers.setTimeout).not.toHaveBeenCalled();

    release([]);
    await Promise.resolve();
    await Promise.resolve();
    expect(timers.setTimeout).toHaveBeenCalledTimes(1);
    stop();
  });

  it("stops reading once stopped", async () => {
    const seen: boolean[] = [];
    const stop = watchDocumentContent((has) => seen.push(has));
    await Promise.resolve();
    await Promise.resolve();
    expect(seen).toHaveLength(1);

    const armed = timers.setTimeout.mock.calls.at(-1)!;
    stop();
    (armed[0] as () => void)();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(seen).toHaveLength(1);
    expect(timers.clearTimeout).toHaveBeenCalled();
  });

  it("waits between reads rather than spinning", async () => {
    const stop = watchDocumentContent(() => {}, 5000);
    await Promise.resolve();
    await Promise.resolve();
    expect(timers.setTimeout.mock.calls.at(-1)![1]).toBe(5000);
    stop();
  });
});
