import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Store } from '../../src/core/store';
import { StoryManager } from '../../src/core/story-manager';
import { FieldID } from '../../src/config/field-definitions';

describe('Store<T>', () => {
  interface TestState {
    count: number;
    text: string;
    nested: { val: number };
  }

  let store: Store<TestState>;

  beforeEach(() => {
    store = new Store<TestState>({
      count: 0,
      text: "init",
      nested: { val: 1 }
    });
  });

  it('should initialize with state', () => {
    expect(store.get().count).toBe(0);
  });

  it('should update state and notify listeners', () => {
    const listener = vi.fn();
    store.subscribe(listener); // Initial call happens here

    store.update(s => {
      s.count = 1;
    });

    // 1st call: Initial state
    // 2nd call: Update
    expect(listener).toHaveBeenCalledTimes(2);
    expect(store.get().count).toBe(1);
    
    // Check diff in 2nd call
    const diff = listener.mock.calls[1][1];
    expect(diff.changed).toContain('count');
    expect(diff.previous.count).toBe(0);
  });

  it('should support selective subscriptions', () => {
    const listener = vi.fn();
    store.select(s => s.text, listener);

    // Initial call
    expect(listener).toHaveBeenCalledWith("init");

    // Update unrelated field
    store.update(s => { s.count = 5; });
    expect(listener).toHaveBeenCalledTimes(1); // No new call

    // Update relevant field
    store.update(s => { s.text = "changed"; });
    expect(listener).toHaveBeenCalledWith("changed");
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('should support reactions', () => {
    const effect = vi.fn();
    store.react(
      diff => diff.changed.includes('count'),
      effect
    );

    store.update(s => { s.text = "ignore"; });
    expect(effect).not.toHaveBeenCalled();

    store.update(s => { s.count = 10; });
    expect(effect).toHaveBeenCalledWith(store.get());
  });
});

describe('StoryManager Integration', () => {
  let manager: StoryManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new StoryManager();
  });

  it('should have a store initialized', () => {
    expect(manager.store).toBeDefined();
    expect(manager.store.get().setting).toBe("Original");
  });

  it('should update store when modifying fields via manager', async () => {
    const listener = vi.fn();
    manager.store.subscribe(listener);

    await manager.setFieldContent(FieldID.StoryPrompt, "New Prompt", "none", false);

    const data = manager.store.get();
    expect(data[FieldID.StoryPrompt].content).toBe("New Prompt");
    
    // Check listener was notified
    // 1: Initial subscription
    // 2: Update
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('should trigger persistence on store changes', async () => {
    // Mock the debouncer to execute immediately or check if called
    // Since we can't easily control the internal debouncer instance,
    // we'll rely on calling setFieldContent with "immediate" which forces save via manager logic,
    // BUT checking if the store reaction also works requires waiting for debounce.
    // Instead, let's check explicit save path first.
    
    await manager.setFieldContent(FieldID.StoryPrompt, "Saved", "immediate", false);
    
    expect(api.v1.storyStorage.set).toHaveBeenCalled();
  });

  it('should update DULFS data via store', async () => {
    await manager.addDulfsItem(FieldID.Factions, {
        id: "1",
        name: "Test Faction",
        category: FieldID.Factions,
        content: "",
        description: "",
        attributes: {},
        linkedLorebooks: []
    } as any);

    const list = manager.getDulfsList(FieldID.Factions);
    expect(list.length).toBe(1);
    expect(list[0].name).toBe("Test Faction");
    
    // Check store state directly
    const data = manager.store.get();
    expect(data[FieldID.Factions].length).toBe(1);
  });
});
