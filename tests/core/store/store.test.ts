import { describe, it, expect, vi } from 'vitest';
import { createStore } from '../../../src/core/store/store';
import { rootReducer, initialRootState } from '../../../src/core/store/reducers/rootReducer';
import { 
  fieldUpdated, 
  storyCleared, 
  storyLoaded, 
  uiSectionToggled, 
  generationRequested 
} from '../../../src/core/store/actions';
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
    store.dispatch(fieldUpdated({ fieldId: FieldID.StoryPrompt, content: 'New content' }));
    
    const state = store.getState();
    expect(state.story.fields[FieldID.StoryPrompt].content).toBe('New content');
  });

  it('should notify subscribers', () => {
    const store = createStore(rootReducer, initialRootState);
    const listener = vi.fn();
    store.subscribe(listener);

    store.dispatch(fieldUpdated({ fieldId: FieldID.StoryPrompt, content: 'Change' }));
    
    expect(listener).toHaveBeenCalled();
  });

  it('should reset entire state on STORY_CLEARED', () => {
    const store = createStore(rootReducer, initialRootState);
    
    // Dirty the state
    store.dispatch(fieldUpdated({ fieldId: FieldID.StoryPrompt, content: 'Dirty Content' }));
    store.dispatch(uiSectionToggled({ id: FieldID.StoryPrompt }));
    store.dispatch(generationRequested({ id: '1', type: 'field', targetId: 'test' }));

    // Verify dirty
    let state = store.getState();
    expect(state.story.fields[FieldID.StoryPrompt].content).toBe('Dirty Content');
    expect(state.ui.collapsedSections[FieldID.StoryPrompt]).toBe(true);
    expect(state.runtime.queue.length).toBe(1);

    // Clear
    store.dispatch(storyCleared());
    
    state = store.getState();
    expect(state.story.fields[FieldID.StoryPrompt].content).toBe(''); // Reset
    expect(state.ui.collapsedSections[FieldID.StoryPrompt]).toBeUndefined(); // Reset
    expect(state.runtime.queue.length).toBe(0); // Reset
  });

  it('should reset UI and Runtime on STORY_LOADED', () => {
    const store = createStore(rootReducer, initialRootState);
    
    // Dirty UI and Runtime
    store.dispatch(uiSectionToggled({ id: FieldID.StoryPrompt }));
    store.dispatch(generationRequested({ id: '1', type: 'field', targetId: 'test' }));
    
    // Load Story
    const newStoryState = {
        ...initialRootState.story,
        setting: 'New Setting'
    };
    
    store.dispatch(storyLoaded({ story: newStoryState }));
    
    const state = store.getState();
    expect(state.story.setting).toBe('New Setting');
    expect(state.ui.collapsedSections[FieldID.StoryPrompt]).toBeUndefined(); // UI Reset
    expect(state.runtime.queue.length).toBe(0); // Runtime Reset
  });
});