import { describe, it, expect, beforeEach } from 'vitest';
import { BrainstormDataManager } from '../../src/core/brainstorm-data-manager';
import { StoryDataManager, StoryData } from '../../src/core/story-data-manager';
import { Store } from '../../src/core/store';
import { FieldID } from '../../src/config/field-definitions';

import { StoryDataManager } from '../../src/core/story-data-manager';

describe('BrainstormDataManager', () => {
  let store: Store<StoryData>;
  let manager: BrainstormDataManager;

  beforeEach(() => {
    const dataManager = new StoryDataManager();
    store = new Store<StoryData>(dataManager.createDefaultData());
    manager = new BrainstormDataManager(store, (action) => action(store));
  });

  it('should return empty array if no messages exist', () => {
    expect(manager.getMessages()).toEqual([]);
  });

  it('should add and retrieve messages', () => {
    manager.addMessage('user', 'Hello');
    manager.addMessage('assistant', 'Hi there');

    const messages = manager.getMessages();
    expect(messages).toHaveLength(2);
    expect(messages[0]).toEqual({ role: 'user', content: 'Hello' });
    expect(messages[1]).toEqual({ role: 'assistant', content: 'Hi there' });
  });

  it('should set messages', () => {
    const newMessages = [
      { role: 'user', content: 'One' },
      { role: 'assistant', content: 'Two' }
    ];
    manager.setMessages(newMessages);
    expect(manager.getMessages()).toEqual(newMessages);
  });

  it('should consolidate messages into a string', () => {
    manager.addMessage('user', 'Hello');
    manager.addMessage('assistant', 'Hi');

    const consolidated = manager.getConsolidated();
    expect(consolidated).toBe('User: Hello\n\nAssistant: Hi');
  });

  it('should handle migration from old card format', () => {
    // Manually inject "old" format into store
    store.update(s => {
        const brainstorm = s[FieldID.Brainstorm];
        brainstorm.data = { cards: [{ id: '1', content: 'Old card' }] };
    });

    expect(manager.getMessages()).toEqual([]);
  });
});
