import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Debouncer } from '../../src/core/debouncer';

describe('Debouncer', () => {
  let debouncer: Debouncer;

  beforeEach(() => {
    vi.useFakeTimers();
    debouncer = new Debouncer();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should execute action after delay', async () => {
    const action = vi.fn().mockResolvedValue(undefined);
    const promise = debouncer.debounceAction('test', action, 100);

    // Wait for the async registration of the timer
    await Promise.resolve(); 
    await Promise.resolve();

    vi.advanceTimersByTime(100);
    
    await promise; 
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('should cancel previous action if same key is debounced again', async () => {
    const action1 = vi.fn().mockResolvedValue(undefined);
    const action2 = vi.fn().mockResolvedValue(undefined);

    await debouncer.debounceAction('test', action1, 100);
    vi.advanceTimersByTime(50);
    
    const promise2 = debouncer.debounceAction('test', action2, 100);
    // Wait for registration (clearTimeout then setTimeout)
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    vi.advanceTimersByTime(100);

    await promise2;
    expect(action1).not.toHaveBeenCalled();
    expect(action2).toHaveBeenCalledTimes(1);
  });

  it('should cancel action manually', async () => {
    const action = vi.fn().mockResolvedValue(undefined);
    await debouncer.debounceAction('test', action, 100);
    
    await debouncer.cancel('test');
    vi.advanceTimersByTime(100);

    await Promise.resolve();
    expect(action).not.toHaveBeenCalled();
  });

  it('should cancel all actions', async () => {
    const action1 = vi.fn().mockResolvedValue(undefined);
    const action2 = vi.fn().mockResolvedValue(undefined);

    await debouncer.debounceAction('key1', action1, 100);
    await debouncer.debounceAction('key2', action2, 100);

    await debouncer.cancelAll();
    vi.advanceTimersByTime(100);

    await Promise.resolve();
    expect(action1).not.toHaveBeenCalled();
    expect(action2).not.toHaveBeenCalled();
  });
});
