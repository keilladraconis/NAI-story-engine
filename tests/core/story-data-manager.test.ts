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
    expect(data.textFieldEnabled).toEqual({});
    expect(data.textFieldEntryIds).toEqual({});
  });

  it('should validate and migrate data when set', () => {
    const data = manager.createDefaultData();
    manager.setData(data);
    expect(manager.data).toEqual(data);
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

  it('should migrate old data by adding missing fields', () => {
    // Simulate old data structure without textFieldEnabled/textFieldEntryIds
    const oldData: any = {
      id: 'old-story',
      version: '0.0.1',
      [FieldID.StoryPrompt]: { id: FieldID.StoryPrompt, content: 'Old Prompt' }
    };

    manager.setData(oldData);
    const data = manager.data!;

    expect(data.textFieldEnabled).toBeDefined();
    expect(data.textFieldEnabled).toEqual({});
    expect(data.textFieldEntryIds).toBeDefined();
    expect(data.textFieldEntryIds).toEqual({});
    expect(data.setting).toBe('Original');
    expect(data[FieldID.StoryPrompt].content).toBe('Old Prompt');
    
    // Check if other fields were initialized
    expect(data[FieldID.ATTG]).toBeDefined();
    expect(data[FieldID.DramatisPersonae]).toEqual([]);
  });
});
