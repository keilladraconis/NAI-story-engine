import { store } from "../core/store";
import type { RootState } from "../core/store/types";

/**
 * Collects store subscriptions and disposes them all at once.
 * Used by SUI components that bridge Tier 3 store state into Tier 1 component state.
 * Create one per component, call dispose() before each recompose.
 */
export class StoreWatcher {
  private _unsubs: (() => void)[] = [];

  watch<T>(
    selector: (s: RootState) => T,
    listener: (val: T) => void,
    equals?: (a: T, b: T) => boolean,
  ): void {
    this._unsubs.push(store.subscribeSelector(selector, listener, equals));
  }

  dispose(): void {
    this._unsubs.forEach(fn => fn());
    this._unsubs = [];
  }
}
