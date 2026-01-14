import { vi } from 'vitest';

// Create a mock implementation of the api.v1 namespace
const apiMock = {
  v1: {
    log: vi.fn(),
    uuid: vi.fn(() => 'mock-uuid-' + Math.random().toString(36).substr(2, 9)),
    createCancellationSignal: vi.fn(() => ({
      cancelled: false,
      cancel: vi.fn(),
      dispose: vi.fn()
    })),
    events: {
        on: vi.fn()
    },
    timers: {
      setTimeout: vi.fn((cb, delay) => setTimeout(cb, delay) as any),
      clearTimeout: vi.fn((id) => {
        clearTimeout(id);
      }),
      sleep: vi.fn((ms) => new Promise(resolve => setTimeout(resolve, ms)))
    },
    script: {
        getAllowedOutput: vi.fn(() => 10000),
        getTimeUntilAllowedOutput: vi.fn(() => 0),
        waitForAllowedOutput: vi.fn().mockResolvedValue(undefined)
    },
    config: {
      get: vi.fn().mockResolvedValue(undefined)
    },
    storyStorage: {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined)
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
      set: vi.fn().mockResolvedValue(undefined)
    },
    an: {
      get: vi.fn().mockResolvedValue(""),
      set: vi.fn().mockResolvedValue(undefined)
    },
    ui: {
      toast: vi.fn()
    },
    generate: vi.fn(),
    buildContext: vi.fn().mockResolvedValue([]),
    maxTokens: vi.fn().mockResolvedValue(8192),
  }
};

// Assign to global
(global as any).api = apiMock;
