import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StoryDataManager, StoryData } from '../../src/core/story-data-manager';
import { FieldID } from '../../src/config/field-definitions';

describe('StoryDataManager', () => {
  let manager: StoryDataManager;

  beforeEach(() => {
    manager = new StoryDataManager();
  });

  it('should create default data', () => {
    const data = manager.createDefaultData();
    expect(data.id).toBe('current-story');
    expect(data[FieldID.StoryPrompt]).toBeDefined();
    expect(data[FieldID.DramatisPersonae]).toEqual([]);
    expect(data.dulfsEnabled).toEqual({});
  });

  it('should notify listeners when data is set', () => {
    const listener = vi.fn();
    manager.subscribe(listener);
    
    manager.setData(manager.createDefaultData());
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('should get and set story fields', () => {
    manager.setData(manager.createDefaultData());
    const fieldId = FieldID.StoryPrompt;
    
    const field = manager.getStoryField(fieldId);
    expect(field).toBeDefined();
    expect(field?.content).toBe('');

    if (field) {
      field.content = 'New Content';
      manager.setStoryField(fieldId, field);
    }

    expect(manager.getStoryField(fieldId)?.content).toBe('New Content');
  });

  it('should get and set DULFS lists', () => {
    manager.setData(manager.createDefaultData());
    const fieldId = FieldID.Factions;
    
    expect(manager.getDulfsList(fieldId)).toEqual([]);

    const newList = [{ id: '1', name: 'Faction A' } as any];
    manager.setDulfsList(fieldId, newList);

    expect(manager.getDulfsList(fieldId)).toEqual(newList);
  });

  it('should save to storyStorage', async () => {
    const data = manager.createDefaultData();
    manager.setData(data);
    
    await manager.save();
    
    expect(api.v1.storyStorage.set).toHaveBeenCalledWith(
      StoryDataManager.KEYS.STORY_DATA,
      data
    );
  });
});
