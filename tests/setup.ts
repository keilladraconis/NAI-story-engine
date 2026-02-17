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
      setTimeout: vi.fn(
        (cb, delay) => Promise.resolve(globalThis.setTimeout(cb, delay)) as any,
      ),
      clearTimeout: vi.fn((id) => {
        globalThis.clearTimeout(id);
      }),
      sleep: vi.fn(
        (ms) => new Promise((resolve) => globalThis.setTimeout(resolve, ms)),
      ),
    },
    script: {
      getAllowedOutput: vi.fn(() => 10000),
      getTimeUntilAllowedOutput: vi.fn(() => 0),
      waitForAllowedOutput: vi.fn().mockResolvedValue(undefined),
      countUncachedInputTokens: vi.fn(() => 0),
    },
    createRolloverHelper: vi.fn((config: { maxTokens: number; rolloverTokens: number; model: string }) => {
      const items: { content: string; role?: string; tokens: number }[] = [];
      return {
        add: vi.fn(async (item: string | { content: string; tokens?: number }) => {
          const content = typeof item === 'string' ? item : item.content;
          const tokens = typeof item === 'string'
            ? Math.ceil(item.length / 4)
            : (item.tokens ?? Math.ceil(content.length / 4));
          items.push({ ...(typeof item === 'string' ? { content: item } : item), tokens });
        }),
        read: vi.fn(() => {
          let total = items.reduce((sum, i) => sum + i.tokens, 0);
          let start = 0;
          while (total > config.maxTokens + config.rolloverTokens && start < items.length) {
            total -= items[start].tokens;
            start++;
          }
          return items.slice(start);
        }),
        peek: vi.fn(() => items),
        getAll: vi.fn(() => items),
        totalTokens: vi.fn(() => items.reduce((sum, i) => sum + i.tokens, 0)),
        count: vi.fn(() => items.length),
        remove: vi.fn(),
        clear: vi.fn(() => { items.length = 0; }),
        compact: vi.fn(),
        getConfig: vi.fn(() => config),
      };
    }),
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
        multilineTextInput: vi.fn((props) => ({
          ...props,
          type: "multilineTextInput",
        })),
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
    rolloverTokens: vi.fn().mockResolvedValue(0),
    tokenizer: {
      encode: vi.fn((text: string) => Promise.resolve(new Array(Math.ceil(text.length / 4)))),
      decode: vi.fn().mockResolvedValue(""),
    },
  },
};

// Assign to global
(globalThis as any).api = apiMock;
