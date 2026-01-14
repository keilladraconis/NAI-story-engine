import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Store, Dispatcher } from '../../src/core/store';
import { StoryManager } from '../../src/core/story-manager';
import { StoryDataManager } from '../../src/core/story-data-manager';
import { FieldID } from '../../src/config/field-definitions';

describe('LorebookSyncService Reactive', () => {
  let manager: StoryManager;
  let store: Store<any>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();

    // Mock entry existence
    (api.v1.lorebook.entry as any).mockImplementation((id: string) => {
        if (id) return Promise.resolve({ id });
        return Promise.resolve(null);
    });

    const dataManager = new StoryDataManager();
    const defaultData = dataManager.createDefaultData();
    store = new Store(defaultData);
    const dispatcher = new Dispatcher(store);
    manager = new StoryManager(store, dispatcher.dispatch.bind(dispatcher));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should sync DULFS category when enabled state changes', async () => {
    // Initial state: enabled
    expect(manager.isDulfsEnabled(FieldID.Factions)).toBe(true);

    // Disable
    await manager.setDulfsEnabled(FieldID.Factions, false);
    
    // Check store updated
    expect(store.get().dulfsEnabled[FieldID.Factions]).toBe(false);

    // Wait for debounce (1000ms)
    await vi.runAllTimersAsync();

    // Verify API call
    // Logic: ensureDulfsCategory checks existing category ID.
    // If it exists (it doesn't in default state), it updates. 
    // If not, it creates.
    // Since default state has no category IDs, it should CREATE a category with enabled=false.
    expect(api.v1.lorebook.createCategory).toHaveBeenCalled();
    const callArgs = (api.v1.lorebook.createCategory as any).mock.calls[0][0];
    expect(callArgs.enabled).toBe(false);
  });

  it('should sync DULFS item when added to list', async () => {
    // Add item
    const item = {
        id: "item1",
        name: "Test Faction",
        category: FieldID.Factions,
        content: "Desc",
        description: "Desc",
        attributes: {},
        linkedLorebooks: []
    };
    await manager.addDulfsItem(FieldID.Factions, item as any);

    // Wait for debounce (new item = 500ms or 1000ms for list sync)
    await vi.runAllTimersAsync();

    // Should create individual entry
    expect(api.v1.lorebook.createEntry).toHaveBeenCalled();
    
    // Check if it created the list summary entry too
    // The implementation syncs both list summary and individual items
    const createCalls = (api.v1.lorebook.createEntry as any).mock.calls.map((c: any) => c[0]);
    const summaryCall = createCalls.find((c: any) => c.displayName === "Factions");
    const itemCall = createCalls.find((c: any) => c.displayName === "Test Faction");

    expect(summaryCall).toBeDefined();
    expect(itemCall).toBeDefined();
  });

  it('should sync text field when content changes', async () => {
    // Enable text field first (Lorebook sync only happens if enabled or if we enable it)
    await manager.setTextFieldLorebookEnabled(FieldID.StoryPrompt, true);
    
    await vi.runAllTimersAsync();
    
    // Initial sync should happen
    expect(api.v1.lorebook.createEntry).toHaveBeenCalledTimes(1);
    vi.clearAllMocks();

    // Update content
    await manager.setFieldContent(FieldID.StoryPrompt, "New Content", "none"); 

    await vi.runAllTimersAsync();

    // Should update existing entry
    expect(api.v1.lorebook.updateEntry).toHaveBeenCalled();
    const updateCall = (api.v1.lorebook.updateEntry as any).mock.calls[0];
    expect(updateCall[1].text).toBe("New Content");
  });

  it('should not sync if debounce is cancelled or not reached', async () => {
    // This is hard to test with fake timers if we runAll, but we can advance time partially.
    await manager.setTextFieldLorebookEnabled(FieldID.StoryPrompt, true);
    await vi.runAllTimersAsync(); // Ensure initial entry is created
    vi.clearAllMocks();

    await manager.setFieldContent(FieldID.StoryPrompt, "Draft 1", "none");
    await vi.advanceTimersByTimeAsync(100);
    
    await manager.setFieldContent(FieldID.StoryPrompt, "Draft 2", "none");
    await vi.advanceTimersByTimeAsync(1100); // 1000ms debounce

    // Should only have synced Draft 2 effectively (or updated to Draft 2)
    // Actually, debounce cancels previous timer. So we expect 1 call with Draft 2.
    // However, createEntry vs updateEntry depends on ID presence.
    // Since we mocked uuid, we assume ID is set.
    
    // Wait, createEntry was called in setup.
    // So updateEntry should be called once.
    expect(api.v1.lorebook.updateEntry).toHaveBeenCalledTimes(1);
    expect((api.v1.lorebook.updateEntry as any).mock.calls[0][1].text).toBe("Draft 2");
  });
});
