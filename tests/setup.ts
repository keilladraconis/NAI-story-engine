import { vi } from "vitest";

// A minimal api.v1 for unit tests: pure logic is tested directly, so this only
// has to let modules load and record calls.
const apiMock = {
  v1: {
    log: vi.fn(),
    uuid: vi.fn(() => "id-" + Math.random().toString(36).slice(2, 10)),
    createCancellationSignal: vi.fn(async () => ({
      cancelled: false,
      cancel: vi.fn(),
      dispose: vi.fn(),
    })),
    hooks: { register: vi.fn() },
    timers: {
      setTimeout: vi.fn((cb: () => void, delay: number) =>
        Promise.resolve(globalThis.setTimeout(cb, delay) as unknown as number),
      ),
      clearTimeout: vi.fn((id: number) => globalThis.clearTimeout(id)),
    },
    script: {
      getAllowedOutput: vi.fn(() => 10000),
      getTimeUntilAllowedOutput: vi.fn(() => 0),
      waitForAllowedOutput: vi.fn().mockResolvedValue(undefined),
      getAllowedInput: vi.fn(() => 100000),
      waitForAllowedInput: vi.fn().mockResolvedValue(undefined),
      countUncachedInputTokens: vi.fn(() => 0),
    },
    config: { get: vi.fn().mockResolvedValue(undefined) },
    storyStorage: {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
    },
    memory: {
      get: vi.fn().mockResolvedValue(""),
      set: vi.fn().mockResolvedValue(undefined),
    },
    an: {
      get: vi.fn().mockResolvedValue(""),
      set: vi.fn().mockResolvedValue(undefined),
    },
    lorebook: {
      categories: vi.fn().mockResolvedValue([]),
      createCategory: vi.fn().mockResolvedValue("cat"),
      entries: vi.fn().mockResolvedValue([]),
      entry: vi.fn().mockResolvedValue(null),
      createEntry: vi.fn().mockResolvedValue("entry"),
      updateEntry: vi.fn().mockResolvedValue(undefined),
    },
    document: {
      sectionIds: vi.fn().mockResolvedValue([]),
      scan: vi.fn().mockResolvedValue([]),
    },
    ui: {
      toast: vi.fn(),
      register: vi.fn(),
      update: vi.fn(),
      part: {
        text: vi.fn((p) => ({ ...p, type: "text" })),
        jsx: vi.fn((p) => ({ ...p, type: "jsx" })),
        container: vi.fn((p) => ({ ...p, type: "container" })),
      },
      extension: {
        sidebarPanel: vi.fn((p) => ({ ...p, type: "sidebarPanel" })),
        scriptPanel: vi.fn((p) => ({ ...p, type: "scriptPanel" })),
        lorebookPanel: vi.fn((p) => ({ ...p, type: "lorebookPanel" })),
      },
    },
    generate: vi.fn(),
  },
};

(globalThis as unknown as { api: typeof apiMock }).api = apiMock;
