import { vi } from "vitest";

// Create a mock implementation of the api.v1 namespace
const apiMock = {
  v1: {
    log: vi.fn(),
    uuid: vi.fn(() => "mock-uuid-" + Math.random().toString(36).substr(2, 9)),
    createCancellationSignal: vi.fn(() => ({
      cancelled: false,
      cancel: vi.fn(),
      dispose: vi.fn(),
    })),
    events: {
      on: vi.fn(),
    },
    hooks: {
      register: vi.fn(),
    },
    timers: {
      setTimeout: vi.fn((cb, delay) => globalThis.setTimeout(cb, delay) as any),
      clearTimeout: vi.fn((id) => {
        globalThis.clearTimeout(id);
      }),
      sleep: vi.fn((ms) => new Promise((resolve) => globalThis.setTimeout(resolve, ms))),
    },
    script: {
      getAllowedOutput: vi.fn(() => 10000),
      getTimeUntilAllowedOutput: vi.fn(() => 0),
      waitForAllowedOutput: vi.fn().mockResolvedValue(undefined),
    },
    config: {
      get: vi.fn().mockResolvedValue(undefined),
    },
    storyStorage: {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
    },
    lorebook: {
      category: vi.fn(),
      createCategory: vi.fn(),
      updateCategory: vi.fn(),
      removeCategory: vi.fn(),
      entry: vi.fn(),
      createEntry: vi.fn(),
      updateEntry: vi.fn(),
      removeEntry: vi.fn(),
    },
    memory: {
      get: vi.fn().mockResolvedValue(""),
      set: vi.fn().mockResolvedValue(undefined),
    },
    an: {
      get: vi.fn().mockResolvedValue(""),
      set: vi.fn().mockResolvedValue(undefined),
    },
    ui: {
      toast: vi.fn(),
      updateParts: vi.fn(),
      part: {
        button: vi.fn((props) => ({ ...props, type: "button" })),
        text: vi.fn((props) => ({ ...props, type: "text" })),
        column: vi.fn((props) => ({ ...props, type: "column" })),
        row: vi.fn((props) => ({ ...props, type: "row" })),
        multilineTextInput: vi.fn((props) => ({ ...props, type: "multilineTextInput" })),
      },
      update: vi.fn(),
      register: vi.fn(),
      extension: {
        sidebarPanel: vi.fn((props) => ({ ...props, type: "sidebarPanel" })),
      },
    },
    generate: vi.fn(),
    buildContext: vi.fn().mockResolvedValue([]),
    maxTokens: vi.fn().mockResolvedValue(8192),
  },
};

// Assign to global
(globalThis as any).api = apiMock;
