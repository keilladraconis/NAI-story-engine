import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BrainstormDataManager } from '../../src/core/brainstorm-data-manager';
import { StoryDataManager } from '../../src/core/story-data-manager';
import { FieldID } from '../../src/config/field-definitions';

describe('BrainstormDataManager', () => {
  let dataManager: StoryDataManager;
  let brainstormDataManager: BrainstormDataManager;

  beforeEach(() => {
    dataManager = new StoryDataManager();
    // Initialize with default data
    dataManager.setData(dataManager.createDefaultData());
    brainstormDataManager = new BrainstormDataManager(dataManager);
  });

  it('should return empty array if no messages exist', () => {
    expect(brainstormDataManager.getMessages()).toEqual([]);
  });

  it('should add and retrieve messages', () => {
    brainstormDataManager.addMessage('user', 'Hello');
    brainstormDataManager.addMessage('assistant', 'Hi there');

    const messages = brainstormDataManager.getMessages();
    expect(messages).toHaveLength(2);
    expect(messages[0]).toEqual({ role: 'user', content: 'Hello' });
    expect(messages[1]).toEqual({ role: 'assistant', content: 'Hi there' });
  });

  it('should set messages', () => {
    const newMessages = [
      { role: 'user', content: 'Test 1' },
      { role: 'assistant', content: 'Test 2' }
    ];
    brainstormDataManager.setMessages(newMessages);
    expect(brainstormDataManager.getMessages()).toEqual(newMessages);
  });

  it('should consolidate messages into a string', () => {
    brainstormDataManager.addMessage('user', 'Topic A');
    brainstormDataManager.addMessage('assistant', 'Reaction B');

    const consolidated = brainstormDataManager.getConsolidated();
    expect(consolidated).toContain('User: Topic A');
    expect(consolidated).toContain('Assistant: Reaction B');
    expect(consolidated).toBe('User: Topic A\n\nAssistant: Reaction B');
  });

  it('should handle migration from old card format', () => {
    const data = dataManager.data!;
    data[FieldID.Brainstorm].data = { cards: [{ text: 'Old Card' }] };
    
    // Should clear and return empty array if messages are missing but cards exist
    expect(brainstormDataManager.getMessages()).toEqual([]);
    expect(data[FieldID.Brainstorm].data.messages).toEqual([]);
  });
});
