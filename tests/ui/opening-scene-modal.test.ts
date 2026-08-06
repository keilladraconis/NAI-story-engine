import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildOpeningSceneContent,
  openOpeningSceneModal,
  OPENING_MODAL_IDS,
  OPENING_PLACEHOLDER,
} from "../../src/ui/header/opening-scene-modal";
import { STORAGE_KEYS } from "../../src/core/keys";

function findPart(tree: unknown, id: string): Record<string, any> | null {
  const node = tree as { id?: string; content?: unknown[] };
  if (node?.id === id) return node as Record<string, any>;
  for (const child of node?.content ?? []) {
    const hit = findPart(child, id);
    if (hit) return hit;
  }
  return null;
}

function part(id: string, onGenerate = () => {}): Record<string, any> {
  const hit = findPart(
    { content: buildOpeningSceneContent(onGenerate) },
    id,
  ) as Record<string, any> | null;
  if (!hit) throw new Error(`no part ${id}`);
  return hit;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.v1.storyStorage.get).mockResolvedValue(null);
});

describe("buildOpeningSceneContent", () => {
  it("asks the question above the box", () => {
    expect(part(OPENING_MODAL_IDS.prompt).text).toBe("Open the story with:");
  });

  it("shows the placeholder examples in the textarea", () => {
    expect(part(OPENING_MODAL_IDS.input).placeholder).toBe(OPENING_PLACEHOLDER);
  });

  // `story:` is a routing directive the UI framework strips: the binding carries
  // it, the storyStorage slot the button reads never does.
  it("binds the textarea to the guidance slot via the story: prefix", () => {
    expect(part(OPENING_MODAL_IDS.input).storageKey).toBe(
      `story:${STORAGE_KEYS.OPENING_GUIDANCE}`,
    );
    expect(STORAGE_KEYS.OPENING_GUIDANCE.startsWith("story:")).toBe(false);
  });

  it("offers a Generate button that cannot double-fire on one tap", () => {
    const button = part(OPENING_MODAL_IDS.generate);
    expect(button.text).toBe("Generate");
    expect(button.disabledWhileCallbackRunning).toBe(true);
  });

  it("Generate reads the guidance from the bare storyStorage slot", async () => {
    vi.mocked(api.v1.storyStorage.get).mockResolvedValue("in media res");
    const onGenerate = vi.fn();
    await part(OPENING_MODAL_IDS.generate, onGenerate).callback();

    expect(api.v1.storyStorage.get).toHaveBeenCalledWith(
      STORAGE_KEYS.OPENING_GUIDANCE,
    );
    expect(onGenerate).toHaveBeenCalledWith("in media res");
  });

  // Generating with an empty box is a supported answer — it means "just open
  // it", and reproduces the behaviour from before the modal existed.
  it("Generate passes an empty string when nothing was typed", async () => {
    const onGenerate = vi.fn();
    await part(OPENING_MODAL_IDS.generate, onGenerate).callback();
    expect(onGenerate).toHaveBeenCalledWith("");
  });

  it("Ctrl+Enter submits the live value without a storage round-trip", () => {
    const onGenerate = vi.fn();
    part(OPENING_MODAL_IDS.input, onGenerate).onSubmit("waking up");

    expect(onGenerate).toHaveBeenCalledWith("waking up");
    expect(api.v1.storyStorage.get).not.toHaveBeenCalled();
  });
});

describe("openOpeningSceneModal", () => {
  function stubModal() {
    const close = vi.fn(async () => {});
    let resolveClosed: () => void = () => {};
    const closed = new Promise<void>((r) => {
      resolveClosed = r;
    });
    vi.mocked(api.v1.ui.modal.open).mockImplementation(async () => ({
      update: vi.fn(),
      close,
      isClosed: vi.fn(() => false),
      closed,
    }));
    return { close, dismiss: () => resolveClosed() };
  }

  function contentOf(): UIPart[] {
    const opts = vi.mocked(api.v1.ui.modal.open).mock.calls[0][0];
    return opts.content;
  }

  it("resolves only once the modal has closed", async () => {
    const { dismiss } = stubModal();
    let settled = false;
    const pending = openOpeningSceneModal(() => {}).then(() => {
      settled = true;
    });

    await Promise.resolve();
    expect(settled).toBe(false);

    dismiss();
    await pending;
    expect(settled).toBe(true);
  });

  // A dismissed modal generates nothing — that is the whole point of asking
  // first rather than firing on the header click.
  it("does not generate when the writer dismisses it", async () => {
    const { dismiss } = stubModal();
    const onGenerate = vi.fn();
    const pending = openOpeningSceneModal(onGenerate);
    dismiss();
    await pending;
    expect(onGenerate).not.toHaveBeenCalled();
  });

  it("closes the modal and generates once when Generate is pressed", async () => {
    const { close, dismiss } = stubModal();
    const onGenerate = vi.fn();
    const pending = openOpeningSceneModal(onGenerate);
    await Promise.resolve();

    const generate = findPart(
      { content: contentOf() },
      OPENING_MODAL_IDS.generate,
    ) as Record<string, any>;
    await generate.callback();

    expect(onGenerate).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    dismiss();
    await pending;
  });

  // Ctrl+Enter and the button are two routes into the same launch; the loser of
  // the race must not queue a second opening in the gap before the close lands.
  it("launches once when both Ctrl+Enter and Generate fire", async () => {
    const { close, dismiss } = stubModal();
    const onGenerate = vi.fn();
    const pending = openOpeningSceneModal(onGenerate);
    await Promise.resolve();

    const content = contentOf();
    const input = findPart({ content }, OPENING_MODAL_IDS.input) as Record<
      string,
      any
    >;
    const generate = findPart(
      { content },
      OPENING_MODAL_IDS.generate,
    ) as Record<string, any>;
    input.onSubmit("in media res");
    await generate.callback();

    expect(onGenerate).toHaveBeenCalledTimes(1);
    expect(onGenerate).toHaveBeenCalledWith("in media res");
    expect(close).toHaveBeenCalledTimes(1);
    dismiss();
    await pending;
  });
});
