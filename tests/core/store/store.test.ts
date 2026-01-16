import { describe, it, expect, vi } from 'vitest';
import { createStore } from '../../../src/core/store/store';
import { rootReducer, initialRootState } from '../../../src/core/store/reducers/rootReducer';
import { ActionTypes, fieldUpdated } from '../../../src/core/store/actions';
import { FieldID } from '../../../src/config/field-definitions';

describe('Redux Store', () => {
  it('should initialize with default state', () => {
    const store = createStore(rootReducer, initialRootState);
    const state = store.getState();
    expect(state.story.setting).toBe('Original');
    expect(state.ui.activeTab).toBe('editor');
  });

  it('should update field content', () => {
    const store = createStore(rootReducer, initialRootState);
    store.dispatch(fieldUpdated(FieldID.StoryPrompt, 'New content'));
    
    const state = store.getState();
    expect(state.story.fields[FieldID.StoryPrompt].content).toBe('New content');
  });

  it('should notify subscribers', () => {
    const store = createStore(rootReducer, initialRootState);
    const listener = vi.fn();
    store.subscribe(listener);

    store.dispatch(fieldUpdated(FieldID.StoryPrompt, 'Change'));
    
    expect(listener).toHaveBeenCalled();
  });
});
